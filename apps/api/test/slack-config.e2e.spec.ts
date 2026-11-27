/**
 * Slack per battalion: each battalion's channels are its own and set only by the platform admin, a
 * battalion with none has no Slack (no fallback to another's), 8239 keeps the channels it had, and the
 * full-database dump goes only to its own channel, and only when Slack confirms that channel is private.
 */
import 'dotenv/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';

// The environment is validated when AppModule is imported, so the bot token has to exist before that.
const slackCalls = vi.hoisted(() => {
  process.env.SLACK_BOT_TOKEN = 'xoxb-test';
  return { uploads: [] as string[], isPrivate: true };
});
vi.mock('@slack/web-api', () => ({
  WebClient: class {
    conversations = { info: async () => ({ channel: { is_private: slackCalls.isPrivate } }) };
    filesUploadV2 = async (args: { channel_id: string }) => {
      slackCalls.uploads.push(args.channel_id);
      return {};
    };
  },
}));

import { AppModule } from '../src/app.module';
import { HOME_BATTALION_ID as HOME } from '../src/common/home-battalion';
import { useBodyParsers } from '../src/common/body-parsers';
import { appValidationPipe } from '../src/common/validation-pipe';
import { DbBackupsService } from '../src/db-backups/db-backups.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SlackConfigService } from '../src/slack/slack-config.service';
import { runAsBattalion } from '../src/tenancy/tenant-context';
import { ownerExec, ownerQuery } from './owner';

const OTHER = '00000000-0000-4000-8000-0000000b7a77';
const OPERATOR = { username: 'e2e_slk_op', password: 'e2e-slk-op-123' };
const PLAIN = { username: 'e2e_slk_admin', password: 'e2e-slk-admin-123' };
const OTHER_ADMIN = { username: 'e2e_slk_other', password: 'e2e-slk-other-123' };

let app: NestExpressApplication;
let prisma: PrismaService;
const jars: Record<string, string> = {};

async function login(u: { username: string; password: string }): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(u).expect(200);
  return (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
}
const get = (jar: string) => request(app.getHttpServer()).get('/api/slack').set('Cookie', jar);
const put = (kind: string, channelId: string | null, jar = jars.op as string) =>
  request(app.getHttpServer()).put(`/api/slack/${kind}`).set('Cookie', jar).send({ channelId });
/** ConfigService serves the environment as it was when the app module loaded, so a test overrides what it reads. */
function withConfig(overrides: Record<string, string | undefined>): () => void {
  const config = app.get(ConfigService);
  const real = config.get.bind(config) as (key: string) => unknown;
  const spy = vi.spyOn(config, 'get').mockImplementation(((key: string) => (key in overrides ? overrides[key] : real(key))) as never);
  return () => spy.mockRestore();
}
const wipe = () => ownerExec(`DELETE FROM app_settings WHERE key LIKE 'slack.%' AND battalion_id IN ('${HOME}','${OTHER}')`);

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  useBodyParsers(app);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(appValidationPipe());
  await app.init();
  prisma = app.get(PrismaService);

  await ownerExec(`INSERT INTO battalions (id, name, number) VALUES ('${OTHER}', 'גדוד 9999', '9999') ON CONFLICT (id) DO NOTHING`);
  await ownerExec(`DELETE FROM users WHERE username LIKE 'e2e_slk_%'`);
  await wipe();
  const hash = (p: string) => bcrypt.hashSync(p, 12);
  await prisma.user.create({ data: { username: OPERATOR.username, displayName: 'מפעיל', role: 'admin', isPlatformAdmin: true, battalionId: HOME, passwordHash: hash(OPERATOR.password) } });
  await prisma.user.create({ data: { username: PLAIN.username, displayName: 'מנהל', role: 'admin', isSuperAdmin: true, battalionId: HOME, passwordHash: hash(PLAIN.password) } });
  await runAsBattalion(OTHER, () =>
    prisma.user.create({ data: { username: OTHER_ADMIN.username, displayName: 'מנהל אחר', role: 'admin', battalionId: OTHER, passwordHash: hash(OTHER_ADMIN.password) } }),
  );
  jars.op = await login(OPERATOR);
  jars.plain = await login(PLAIN);
  jars.other = await login(OTHER_ADMIN);
});

beforeEach(async () => {
  await wipe();
  slackCalls.uploads.length = 0;
  slackCalls.isPrivate = true;
});

afterAll(async () => {
  await wipe();
  await ownerExec(`DELETE FROM db_backups WHERE file_path LIKE '/e2e-slack/%'`);
  await ownerExec(`DELETE FROM users WHERE username LIKE 'e2e_slk_%'`);
  await app.close();
});

describe('per-battalion Slack channels', () => {
  it('starts with nothing configured, and only the platform admin sees the channel ids', async () => {
    const plain = (await get(jars.plain as string).expect(200)).body;
    expect(plain).toEqual({ botReady: true, configured: { snapshots: false, mesakem: false, attendance: false }, channels: null });
    expect((await get(jars.op as string).expect(200)).body.channels).toEqual({ snapshots: null, mesakem: null, attendance: null });
  });

  it("sets and clears a channel; a battalion's own super admin cannot, and a bad id is refused", async () => {
    await put('attendance', 'C0HOMECHAN1', jars.plain as string).expect(403);
    await put('attendance', 'not-a-channel').expect(400);
    await put('nope', 'C0HOMECHAN1').expect(400);

    const set = await put('attendance', 'C0HOMECHAN1').expect(200);
    expect(set.body.configured.attendance).toBe(true);
    expect(set.body.channels.attendance).toBe('C0HOMECHAN1');
    expect((await get(jars.plain as string)).body.configured.attendance).toBe(true);

    const cleared = await put('attendance', null).expect(200);
    expect(cleared.body.configured.attendance).toBe(false);
  });

  it("one battalion's channel is never another's, and there is no fallback", async () => {
    await put('mesakem', 'C0HOMECHAN2').expect(200);
    const slack = app.get(SlackConfigService);
    expect(await runAsBattalion(HOME, () => slack.channel('mesakem'))).toBe('C0HOMECHAN2');
    expect(await runAsBattalion(OTHER, () => slack.channel('mesakem'))).toBeUndefined();
    expect((await get(jars.other as string)).body.configured.mesakem).toBe(false);
  });

  it('without a bot nothing counts as configured', async () => {
    await put('snapshots', 'C0HOMECHAN3').expect(200);
    const restore = withConfig({ SLACK_BOT_TOKEN: undefined });
    try {
      const body = (await get(jars.plain as string)).body;
      expect(body.botReady).toBe(false);
      expect(body.configured.snapshots).toBe(false);
    } finally {
      restore();
    }
  });

  it('gives 8239 the channels it already had from the environment, once, and nobody else', async () => {
    const restore = withConfig({ SLACK_CHANNEL_ID: 'C0LEGACY001' });
    const slack = app.get(SlackConfigService);
    await slack.onApplicationBootstrap();
    expect(await runAsBattalion(HOME, () => slack.channel('snapshots'))).toBe('C0LEGACY001');
    expect(await runAsBattalion(OTHER, () => slack.channel('snapshots'))).toBeUndefined();

    // A channel the platform admin has since changed is not overwritten on the next boot.
    await put('snapshots', 'C0CHANGED01').expect(200);
    await slack.onApplicationBootstrap();
    expect(await runAsBattalion(HOME, () => slack.channel('snapshots'))).toBe('C0CHANGED01');
    restore();
  });

  it('records each change in the security log', async () => {
    await put('kits-not-a-kind', 'C0HOMECHAN1').expect(400);
    await put('attendance', 'C0HOMECHAN1').expect(200);
    const rows = await ownerQuery<{ detail: string }>(
      `SELECT detail FROM security_events WHERE type = 'SLACK_CHANGED' AND battalion_id = $1 ORDER BY at DESC LIMIT 1`,
      [HOME],
    );
    expect(rows[0]?.detail).toBe('attendance=C0HOMECHAN1');
  });
});

describe('the full-database dump', () => {
  async function aBackup(): Promise<string> {
    const rows = await ownerQuery<{ id: string }>(
      `INSERT INTO db_backups (id, kind, file_path, size_bytes) VALUES (gen_random_uuid()::text, 'manual', '/e2e-slack/dump.sql.gz', 100) RETURNING id`,
    );
    return rows[0]?.id as string;
  }

  it("is not sent to a battalion's channel, only to its own, and not at all while that is unset", async () => {
    const restore = withConfig({ SLACK_CHANNEL_ID: 'C0LEGACY001', DB_BACKUP_SLACK_CHANNEL_ID: undefined });
    await put('snapshots', 'C0HOMECHAN3').expect(200);
    const id = await aBackup();
    const result = await runAsBattalion(HOME, () => app.get(DbBackupsService).sendToSlack(id));
    expect(result.sent).toBe(false);
    expect(slackCalls.uploads).toEqual([]);
    restore();
  });

  it('goes to the private dump channel', async () => {
    const restore = withConfig({ DB_BACKUP_SLACK_CHANNEL_ID: 'G0DUMPCHAN1' });
    try {
      const id = await aBackup();
      const result = await runAsBattalion(HOME, () => app.get(DbBackupsService).sendToSlack(id));
      expect(result.sent).toBe(true);
      expect(slackCalls.uploads).toEqual(['G0DUMPCHAN1']);
    } finally {
      restore();
    }
  });

  it('is refused when the channel is not private', async () => {
    const restore = withConfig({ DB_BACKUP_SLACK_CHANNEL_ID: 'C0PUBLIC001' });
    slackCalls.isPrivate = false;
    try {
      const id = await aBackup();
      const result = await runAsBattalion(HOME, () => app.get(DbBackupsService).sendToSlack(id));
      expect(result.sent).toBe(false);
      expect(slackCalls.uploads).toEqual([]);
    } finally {
      restore();
    }
  });
});
