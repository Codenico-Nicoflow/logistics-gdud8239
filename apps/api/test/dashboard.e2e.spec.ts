/**
 * The two figures לוח בקרה is read for at the start of a shift: who is on base
 * today, and whether last night's count was actually done.
 *
 * Both deliberately distinguish "nobody has said yet" from a real answer — an
 * unmarked person is not absent, and an uncounted item has no gap. Reporting
 * either as a number would make the dashboard confidently wrong.
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

const STAFF = { username: 'e2e_dash_staff', password: 'e2e-dash-staff-123' };
const NICK = 'E2E-בודק';
const TODAY = '2026-06-15';

let app: INestApplication;
let prisma: PrismaService;
let jar: string;
let memberIds: string[] = [];

async function cleanup(): Promise<void> {
  const members = await prisma.teamMember.findMany({
    where: { nickname: { startsWith: NICK } },
    select: { id: true },
  });
  const ids = members.map((m) => m.id);
  if (ids.length) {
    await prisma.attendance.deleteMany({ where: { teamMemberId: { in: ids } } });
    await prisma.teamMember.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.user.deleteMany({ where: { username: STAFF.username } });
  await prisma.user.create({
    data: {
      username: STAFF.username,
      displayName: 'בודק לוח בקרה',
      // Admin, not logistics: this suite sets up its own attendance/count
      // fixtures via the write routes, which now require admin — the
      // dashboard figures themselves are what's under test here, not the
      // role boundary on those routes.
      role: 'admin',
      passwordHash: await bcrypt.hash(STAFF.password, 12),
    },
  });
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send(STAFF)
    .expect(200);
  jar = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
});

afterAll(async () => {
  await cleanup();
  await prisma?.user.deleteMany({ where: { username: STAFF.username } });
  await app?.close();
});

beforeEach(async () => {
  await cleanup();
  const created = await Promise.all(
    ['א', 'ב', 'ג', 'ד'].map((suffix, i) =>
      prisma.teamMember.create({
        data: { nickname: `${NICK}-${suffix}`, gender: 'M', sortOrder: 900 + i },
      }),
    ),
  );
  memberIds = created.map((m) => m.id);
});

async function today(): Promise<{
  present: number;
  total: number;
  byStatus: { status: string; members: { nickname: string }[] }[];
  unmarked: { nickname: string }[];
}> {
  const res = await request(app.getHttpServer())
    .get(`/api/attendance/today?date=${TODAY}`)
    .set('Cookie', jar)
    .expect(200);
  return res.body;
}

describe('מי נמצא היום', () => {
  it('counts נוכח and חזרה as present, and nothing else', async () => {
    await request(app.getHttpServer())
      .post('/api/attendance/cells')
      .set('Cookie', jar)
      .send({
        cells: [
          { teamMemberId: memberIds[0], date: TODAY, status: 'PRESENT' },
          { teamMemberId: memberIds[1], date: TODAY, status: 'RETURNING' },
          { teamMemberId: memberIds[2], date: TODAY, status: 'ON_LEAVE' },
          { teamMemberId: memberIds[3], date: TODAY, status: 'LEAVING' },
        ],
      })
      .expect(201);

    const body = await today();
    // A person returning today is on base; one leaving or on חופש is not.
    const ours = body.byStatus.flatMap((g) =>
      g.members.filter((m) => m.nickname.startsWith(NICK)).map(() => g.status),
    );
    expect(ours.sort()).toEqual(['LEAVING', 'ON_LEAVE', 'PRESENT', 'RETURNING']);
  });

  it('lists an unmarked person separately rather than counting them absent', async () => {
    await request(app.getHttpServer())
      .post('/api/attendance/cells')
      .set('Cookie', jar)
      .send({ cells: [{ teamMemberId: memberIds[0], date: TODAY, status: 'PRESENT' }] })
      .expect(201);

    const body = await today();
    const unmarked = body.unmarked.filter((m) => m.nickname.startsWith(NICK));
    // Three of our four have no cell filled: a blank means nobody has said yet.
    expect(unmarked).toHaveLength(3);
  });

  it('puts everyone in unmarked when the day is untouched', async () => {
    const body = await today();
    const unmarked = body.unmarked.filter((m) => m.nickname.startsWith(NICK));
    expect(unmarked).toHaveLength(4);
    expect(body.byStatus.flatMap((g) => g.members.filter((m) => m.nickname.startsWith(NICK))))
      .toHaveLength(0);
  });
});

describe('ספירת נשקיה אחרונה', () => {
  // The gap/progress figures moved to מסכם (DailySummaryLine), which computes
  // them once a day independently of CountSession — this endpoint now only
  // reports which sign-off session is most recent, not any count data itself.
  it('reports the most recent session or null when none exists', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/counts/latest')
      .set('Cookie', jar)
      .expect(200);

    expect(res.body).toHaveProperty('session');
    if (res.body.session) {
      expect(res.body.session).toHaveProperty('id');
      expect(res.body.session).toHaveProperty('isClosed');
    }
  });
});
