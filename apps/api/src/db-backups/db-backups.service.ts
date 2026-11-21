import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DbBackupKind } from '@prisma/client';
import { WebClient } from '@slack/web-api';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

/**
 * Full-database disaster-recovery backup — a raw `pg_dump` of every table,
 * not just the ones the xlsx exporter (SnapshotsService) knows about. Users,
 * issue forms, attendance, permissions, service periods — everything. Never
 * read back into the app; its only job is to exist somewhere else if the
 * machine this runs on is lost (disk failure, theft, fire — the app runs on
 * a home server with no other copy of its data).
 *
 * Deliberately a separate model/service from Snapshot: the xlsx export is a
 * business artifact (re-importable, human-readable, sent for visibility),
 * this is a plumbing artifact (opaque binary, sent purely for safekeeping).
 * Mirrors SnapshotsService's own shape (daily cron, manual trigger, Slack
 * upload, local retention) so the two are familiar to maintain side by side.
 */
@Injectable()
export class DbBackupsService {
  private readonly logger = new Logger(DbBackupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get dir(): string {
    return resolve(this.config.get<string>('DB_BACKUP_DIR') ?? './data/db-backups');
  }

  /**
   * Runs `pg_dump` against the same DATABASE_URL the app itself uses, gzips
   * the output as it streams to disk (never held fully in memory — a dump of
   * this DB is small today, but nothing here should assume it stays that
   * way), and records the result.
   */
  async create(kind: DbBackupKind, actor?: AuthUser): Promise<{ id: string; filePath: string }> {
    await mkdir(this.dir, { recursive: true });

    const databaseUrl = this.config.get<string>('DATABASE_URL');
    if (!databaseUrl) throw new Error('DATABASE_URL אינו מוגדר');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `logistics-db-${kind}-${stamp}.sql.gz`;
    const filePath = join(this.dir, fileName);

    await this.dumpToFile(databaseUrl, filePath);

    const { size } = await stat(filePath);
    // A real dump of this schema is well over this even on a fresh DB — an
    // empty or near-empty file means pg_dump failed in a way that didn't
    // throw (it has, before: the `schema` query param Prisma's URL carries
    // confuses pg_dump's own URI parser, which errored but still let an
    // empty gzip stream complete "successfully"). Recording that as a good
    // backup would be worse than not backing up at all — it would look fine
    // in the list and still lose everything if ever restored from.
    if (size < 1024) {
      await unlink(filePath).catch(() => {});
      throw new Error(`גיבוי ה-DB יצא קטן מדי (${size} bytes) — כנראה נכשל בשקט`);
    }

    const backup = await this.prisma.dbBackup.create({
      data: {
        kind,
        filePath,
        sizeBytes: size,
        createdByUserId: actor?.id ?? null,
      },
    });

    this.logger.log(`DB backup ${kind} written: ${fileName} (${size} bytes)`);
    return { id: backup.id, filePath };
  }

  /** pg_dump's own URI parser does not understand the `?schema=` query
   *  param Prisma's connection string carries — passed through unchanged, it
   *  errors out (silently, from the caller's point of view: stdout still
   *  closes and a gzip of nothing "succeeds"). Stripped here and passed back
   *  as pg_dump's own `-n` flag instead, which means the same thing to it. */
  private forPgDump(databaseUrl: string): { url: string; schema: string } {
    const url = new URL(databaseUrl);
    const schema = url.searchParams.get('schema') ?? 'public';
    url.searchParams.delete('schema');
    return { url: url.toString(), schema };
  }

  private dumpToFile(databaseUrl: string, filePath: string): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      const { url, schema } = this.forPgDump(databaseUrl);
      // --no-owner/--no-privileges: a restore target may have a differently
      // named DB role, and the dump should not fail a restore over that.
      const dump = spawn('pg_dump', ['--no-owner', '--no-privileges', '-n', schema, '--dbname', url]);

      let stderr = '';
      dump.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });

      const gzip = createGzip();
      const out = createWriteStream(filePath);

      pipeline(dump.stdout, gzip, out).then(resolvePromise, reject);

      dump.on('error', reject);
      dump.on('close', (code) => {
        if (code !== 0) reject(new Error(`pg_dump exited with code ${code}: ${stderr.slice(0, 2000)}`));
      });
    });
  }

  list(limit = 50) {
    return this.prisma.dbBackup.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { createdBy: { select: { displayName: true } } },
    });
  }

  async readFile(id: string): Promise<{ stream: ReturnType<typeof createReadStream>; fileName: string }> {
    const backup = await this.prisma.dbBackup.findUnique({ where: { id } });
    if (!backup) throw new NotFoundException('הגיבוי אינו קיים');
    try {
      await stat(backup.filePath);
    } catch {
      throw new NotFoundException('קובץ הגיבוי אינו קיים בדיסק');
    }
    return {
      stream: createReadStream(backup.filePath),
      fileName: backup.filePath.split('/').pop() ?? 'backup.sql.gz',
    };
  }

  /** Admin cleanup. The Slack copy, if one was sent, is not touched. */
  async remove(id: string): Promise<{ id: string }> {
    const row = await this.prisma.dbBackup.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('הגיבוי אינו קיים');
    await this.prisma.dbBackup.delete({ where: { id } });
    await unlink(row.filePath).catch(() => {});
    return { id };
  }

  /**
   * The daily run. Written right after SnapshotsService's own daily cron
   * (18:05 vs 18:00) so the two don't contend for DB/disk I/O at the exact
   * same second — not that it would actually matter at this data size, but
   * there's no reason to find out.
   */
  @Cron('5 18 * * *', { timeZone: 'Asia/Jerusalem', name: 'daily-db-backup' })
  async dailyBackup(): Promise<void> {
    // Local dev machines run this same cron schedule, which would otherwise
    // dump a developer's local Postgres and push it to the real production
    // Slack channel every evening — only the real production deploy backs up.
    if (this.config.get<string>('NODE_ENV') !== 'production') return;
    this.logger.log('Running daily DB backup');
    try {
      const { id } = await this.create('daily');
      await this.sendToSlack(id);
      await this.pruneOldDaily();
    } catch (e) {
      this.logger.error('Daily DB backup failed', e instanceof Error ? e.stack : String(e));
    }
  }

  async sendToSlack(backupId: string): Promise<{ sent: boolean; error?: string }> {
    const token = this.config.get<string>('SLACK_BOT_TOKEN');
    const channel = this.config.get<string>('SLACK_CHANNEL_ID');
    if (!token || !channel) {
      this.logger.warn('Slack not configured; DB backup stored but not sent');
      return { sent: false, error: 'Slack אינו מוגדר' };
    }

    const backup = await this.prisma.dbBackup.findUnique({ where: { id: backupId } });
    if (!backup) throw new NotFoundException('הגיבוי אינו קיים');

    try {
      const today = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
      const sizeMb = (backup.sizeBytes / (1024 * 1024)).toFixed(1);

      const slack = new WebClient(token);
      await slack.filesUploadV2({
        channel_id: channel,
        file: backup.filePath,
        filename: backup.filePath.split('/').pop() ?? 'logistics-db.sql.gz',
        initial_comment: `גיבוי מסד נתונים מלא — ${today} (${sizeMb}MB)`,
      });

      await this.prisma.dbBackup.update({
        where: { id: backupId },
        data: { slackSentAt: new Date(), slackError: null },
      });
      this.logger.log(`DB backup ${backupId} sent to Slack`);
      return { sent: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await this.prisma.dbBackup.update({
        where: { id: backupId },
        data: { slackError: error.slice(0, 500) },
      });
      this.logger.error(`Slack upload failed for ${backupId}: ${error}`);
      return { sent: false, error };
    }
  }

  /** Keeps the configured number of daily backups on local disk — Slack
   *  itself is the long-term archive once a backup has been sent there. */
  private async pruneOldDaily(): Promise<void> {
    const keep = Number(this.config.get<string>('DB_BACKUP_RETENTION_DAILY') ?? 14);
    const stale = await this.prisma.dbBackup.findMany({
      where: { kind: 'daily' },
      orderBy: { createdAt: 'desc' },
      skip: keep,
    });

    for (const backup of stale) {
      try {
        await unlink(backup.filePath);
      } catch {
        // Already gone from disk; the row is still worth removing.
      }
      await this.prisma.dbBackup.delete({ where: { id: backup.id } });
    }
    if (stale.length) this.logger.log(`Pruned ${stale.length} old daily DB backups`);
  }
}
