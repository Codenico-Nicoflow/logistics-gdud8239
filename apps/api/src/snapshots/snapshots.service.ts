import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SnapshotKind } from '@prisma/client';
import { WebClient } from '@slack/web-api';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { ExcelExportService } from '../excel/excel-export.service';
import type { AuthUser } from '../auth/auth.types';

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly exporter: ExcelExportService,
    private readonly config: ConfigService,
  ) {}

  private get dir(): string {
    return resolve(this.config.get<string>('SNAPSHOT_DIR') ?? './data/snapshots');
  }

  /**
   * Writes a snapshot to disk and records it.
   *
   * Stored snapshots are the real safety net: they do not depend on Slack
   * succeeding, and they survive a wipe-and-replace import.
   */
  async create(kind: SnapshotKind, actor?: AuthUser): Promise<{ id: string; filePath: string }> {
    await mkdir(this.dir, { recursive: true });

    const buffer = await this.exporter.toBuffer();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `logistics-${kind}-${stamp}.xlsx`;
    const filePath = join(this.dir, fileName);
    await writeFile(filePath, buffer);

    const rowCount = await this.prisma.signature.count({ where: { returnedAt: null } });
    const snapshot = await this.prisma.snapshot.create({
      data: {
        kind,
        filePath,
        sizeBytes: buffer.byteLength,
        rowCount,
        createdByUserId: actor?.id ?? null,
      },
    });

    this.logger.log(`Snapshot ${kind} written: ${fileName} (${buffer.byteLength} bytes, ${rowCount} rows)`);
    return { id: snapshot.id, filePath };
  }

  list(limit = 50) {
    return this.prisma.snapshot.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { createdBy: { select: { displayName: true } } },
    });
  }

  async readFile(id: string): Promise<{ stream: ReturnType<typeof createReadStream>; fileName: string }> {
    const snapshot = await this.prisma.snapshot.findUnique({ where: { id } });
    if (!snapshot) throw new NotFoundException('הגיבוי אינו קיים');
    try {
      await stat(snapshot.filePath);
    } catch {
      throw new NotFoundException('קובץ הגיבוי אינו קיים בדיסק');
    }
    return {
      stream: createReadStream(snapshot.filePath),
      fileName: snapshot.filePath.split('/').pop() ?? 'snapshot.xlsx',
    };
  }

  /**
   * The daily 18:00 send.
   *
   * The snapshot is written first and the Slack upload is attempted second, so a
   * Slack outage never costs a backup. A failure is recorded on the row.
   */
  @Cron('0 18 * * *', { timeZone: 'Asia/Jerusalem', name: 'daily-snapshot' })
  async dailySnapshot(): Promise<void> {
    // Same reasoning as DbBackupsService#dailyBackup: a local dev machine
    // running this cron would otherwise send its own data to the real
    // production Slack channel every evening.
    if (this.config.get<string>('NODE_ENV') !== 'production') return;
    this.logger.log('Running daily snapshot');
    try {
      const { id } = await this.create('daily');
      await this.sendToSlack(id);
      await this.pruneOldDaily();
    } catch (e) {
      this.logger.error('Daily snapshot failed', e instanceof Error ? e.stack : String(e));
    }
  }

  async sendToSlack(snapshotId: string): Promise<{ sent: boolean; error?: string }> {
    const token = this.config.get<string>('SLACK_BOT_TOKEN');
    const channel = this.config.get<string>('SLACK_CHANNEL_ID');
    if (!token || !channel) {
      this.logger.warn('Slack not configured; snapshot stored but not sent');
      return { sent: false, error: 'Slack אינו מוגדר' };
    }

    const snapshot = await this.prisma.snapshot.findUnique({ where: { id: snapshotId } });
    if (!snapshot) throw new NotFoundException('הגיבוי אינו קיים');

    try {
      const issued = await this.prisma.signature.count({ where: { returnedAt: null } });
      const today = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });

      const slack = new WebClient(token);
      await slack.filesUploadV2({
        channel_id: channel,
        file: snapshot.filePath,
        filename: snapshot.filePath.split('/').pop() ?? 'logistics.xlsx',
        initial_comment:
          `דוח צל"מ יומי — ${today}\n` +
          `חתימות פעילות: ${issued}`,
      });

      await this.prisma.snapshot.update({
        where: { id: snapshotId },
        data: { slackSentAt: new Date(), slackError: null },
      });
      this.logger.log(`Snapshot ${snapshotId} sent to Slack`);
      return { sent: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await this.prisma.snapshot.update({
        where: { id: snapshotId },
        data: { slackError: error.slice(0, 500) },
      });
      this.logger.error(`Slack upload failed for ${snapshotId}: ${error}`);
      return { sent: false, error };
    }
  }

  /** Keeps the configured number of daily snapshots; pre-import ones are kept forever. */
  private async pruneOldDaily(): Promise<void> {
    const keep = Number(this.config.get<string>('SNAPSHOT_RETENTION_DAILY') ?? 30);
    const stale = await this.prisma.snapshot.findMany({
      where: { kind: 'daily' },
      orderBy: { createdAt: 'desc' },
      skip: keep,
    });

    for (const snapshot of stale) {
      try {
        await unlink(snapshot.filePath);
      } catch {
        // Already gone from disk; the row is still worth removing.
      }
      await this.prisma.snapshot.delete({ where: { id: snapshot.id } });
    }
    if (stale.length) this.logger.log(`Pruned ${stale.length} old daily snapshots`);
  }
}
