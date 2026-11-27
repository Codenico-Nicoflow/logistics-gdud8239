/**
 * The weekly ימי יציאה post: what is sent, that the scheduled one cannot go out twice,
 * and that a failure does not lock the week. Slack itself is replaced by a recorder.
 */
import 'dotenv/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SlackFileSender } from '../src/common/slack-file-sender';
import { AttendanceSlackService } from '../src/attendance/attendance-slack.service';

const ADMIN = { username: 'e2e_attslack_admin', password: 'e2e-attslack-admin-123' };
const NICK = 'E2E-שליחה';
const WEEK = '2031-09-14'; // a Sunday
const INSIDE = '2031-09-16';

type Sent = { kind: 'file' | 'message'; channel: string; name?: string; bytes?: Buffer; text: string };
const sent: Sent[] = [];
let failNextFile = false;
let configured = true;

const fakeSender = {
  channelFor: async (): Promise<string | undefined> => (configured ? 'C_TEST_CHANNEL' : undefined),
  sendFile: async (channel: string, bytes: Buffer, name: string, text: string): Promise<void> => {
    if (failNextFile) {
      failNextFile = false;
      throw new Error('slack down');
    }
    sent.push({ kind: 'file', channel, name, bytes, text });
  },
  sendMessage: async (channel: string, text: string): Promise<void> => {
    sent.push({ kind: 'message', channel, text });
  },
};

let app: INestApplication;
let prisma: PrismaService;
let service: AttendanceSlackService;
let jar: string;
let memberId: string;

async function clean(): Promise<void> {
  await prisma.attendanceWeekSend.deleteMany({ where: { weekStart: { gte: new Date('2031-09-01'), lte: new Date('2031-09-30') } } });
  await prisma.teamMember.deleteMany({ where: { nickname: NICK } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SlackFileSender)
    .useValue(fakeSender)
    .compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);
  service = app.get(AttendanceSlackService);

  await prisma.user.deleteMany({ where: { username: ADMIN.username } });
  await prisma.user.create({
    data: { username: ADMIN.username, displayName: 'מנהל שליחה', role: 'admin', passwordHash: await bcrypt.hash(ADMIN.password, 12) },
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);
  jar = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
});

afterAll(async () => {
  await clean();
  await prisma?.user.deleteMany({ where: { username: ADMIN.username } });
  await app?.close();
});

beforeEach(async () => {
  await clean();
  sent.length = 0;
  failNextFile = false;
  configured = true;
  memberId = (await prisma.teamMember.create({ data: { nickname: NICK } })).id;
});

const fill = (date: string) =>
  prisma.attendance.upsert({
    where: { teamMemberId_date: { teamMemberId: memberId, date: new Date(date) } },
    update: {},
    create: { teamMemberId: memberId, date: new Date(date), status: 'PRESENT' },
  });

describe('weekly ימי יציאה to Slack', () => {
  it('the button sends the chosen week as a PDF to the configured channel', async () => {
    await fill(INSIDE);
    const res = await request(app.getHttpServer()).post('/api/attendance/send-week').set('Cookie', jar).send({ date: INSIDE }).expect(201);
    expect(res.body).toMatchObject({ sent: true, weekStart: WEEK });
    expect(sent).toHaveLength(1);
    const msg = sent[0] as Sent;
    expect(msg).toMatchObject({ kind: 'file', channel: 'C_TEST_CHANNEL', name: `ימי-יציאה-${WEEK}.pdf` });
    expect(msg.bytes?.subarray(0, 4).toString()).toBe('%PDF');
    expect(msg.bytes?.length).toBeGreaterThan(5000);
  });

  it('can be sent by hand again and again', async () => {
    await fill(INSIDE);
    const post = () => request(app.getHttpServer()).post('/api/attendance/send-week').set('Cookie', jar).send({ date: INSIDE });
    await post().expect(201);
    const second = await post().expect(201);
    expect(second.body.sent).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('the scheduled send claims the week: a second one stays quiet', async () => {
    await fill(INSIDE);
    expect((await service.sendWeek(INSIDE, 'cron')).sent).toBe(true);
    const again = await service.sendWeek(INSIDE, 'cron');
    expect(again).toMatchObject({ sent: false, error: 'השבוע כבר נשלח' });
    expect(sent).toHaveLength(1);
  });

  it('the scheduled send of an empty week posts a short note, not an empty table', async () => {
    await service.sendWeek(INSIDE, 'cron');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: 'message', channel: 'C_TEST_CHANNEL' });
    expect(sent[0]?.text).toContain('עדיין לא מולאו');
  });

  it('a failed send does not lock the scheduled week', async () => {
    await fill(INSIDE);
    failNextFile = true;
    const failed = await service.sendWeek(INSIDE, 'cron');
    expect(failed).toMatchObject({ sent: false, error: 'slack down' });
    expect((await service.sendWeek(INSIDE, 'cron')).sent).toBe(true);
  });

  it('reports Slack as not configured instead of failing', async () => {
    configured = false;
    await fill(INSIDE);
    const res = await service.sendWeek(INSIDE, 'manual');
    expect(res).toMatchObject({ sent: false, error: 'Slack אינו מוגדר' });
    expect(sent).toHaveLength(0);
  });

  it('is admin only', async () => {
    await request(app.getHttpServer()).post('/api/attendance/send-week').send({}).expect(401);
  });
});
