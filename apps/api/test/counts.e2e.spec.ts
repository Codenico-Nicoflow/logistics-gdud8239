/**
 * ספירת נשקיה — undoing a closed count.
 *
 * Closing is a signed act, so cancelling it is admin-only, needs a reason,
 * clears both signatures (they signed a sheet that is about to change) and
 * leaves a record of who did it.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const ADMIN = { username: 'e2e_count_admin', password: 'e2e-count-admin-123' };
const STAFF = { username: 'e2e_count_staff', password: 'e2e-count-staff-123' };
/** A date no real count will ever use, so this cannot touch real data. */
const DAY = '2031-03-14';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let app: INestApplication;
let prisma: PrismaService;
let adminJar: string;
let staffJar: string;
let sessionId: string;

const cookie = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');

async function cleanup(): Promise<void> {
  await prisma.countSession.deleteMany({ where: { sessionDate: new Date(DAY) } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  prisma = app.get(PrismaService);

  await cleanup();
  await prisma.user.deleteMany({ where: { username: { in: [ADMIN.username, STAFF.username] } } });
  await prisma.user.create({
    data: { username: ADMIN.username, displayName: 'מנהל ספירה', role: 'admin', passwordHash: await bcrypt.hash(ADMIN.password, 12) },
  });
  await prisma.user.create({
    data: { username: STAFF.username, displayName: 'לוגיסטיקה ספירה', role: 'logistics', passwordHash: await bcrypt.hash(STAFF.password, 12) },
  });
  adminJar = cookie(await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200));
  staffJar = cookie(await request(app.getHttpServer()).post('/api/auth/login').send(STAFF).expect(200));
});

afterAll(async () => {
  await cleanup();
  await prisma?.user.deleteMany({ where: { username: { in: [ADMIN.username, STAFF.username] } } });
  await app?.close();
});

async function closedSession(): Promise<string> {
  await cleanup();
  const staff = await prisma.user.findUniqueOrThrow({ where: { username: STAFF.username } });
  const created = await prisma.countSession.create({
    data: {
      sessionDate: new Date(DAY),
      shift: 'EVENING',
      isClosed: true,
      recordedByUserId: staff.id,
      responsibleName: 'ישראל ישראלי',
      responsiblePn: '1234567',
      responsibleRank: 'רס"ל',
      responsibleSignatureImage: PNG,
      officerName: 'משה כהן',
      officerPn: '7654321',
      officerRank: 'סגן',
      officerSignatureImage: PNG,
    },
  });
  return created.id;
}

const reopen = (jar: string, body: object) =>
  request(app.getHttpServer()).post(`/api/counts/${sessionId}/reopen`).set('Cookie', jar).send(body);

describe('cancelling a closed count', () => {
  it('is refused for anyone but an admin', async () => {
    sessionId = await closedSession();
    await reopen(staffJar, { reason: 'טעות בסגירה' }).expect(403);
    expect((await prisma.countSession.findUniqueOrThrow({ where: { id: sessionId } })).isClosed).toBe(true);
  });

  it('needs a reason', async () => {
    sessionId = await closedSession();
    await reopen(adminJar, {}).expect(400);
    await reopen(adminJar, { reason: 'ab' }).expect(400);
    expect((await prisma.countSession.findUniqueOrThrow({ where: { id: sessionId } })).isClosed).toBe(true);
  });

  it('reopens, clears both signatures, keeps the names and records who and why', async () => {
    sessionId = await closedSession();
    await reopen(adminJar, { reason: 'נסגר בטעות לפני סיום' }).expect(201);

    const after = await prisma.countSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(after.isClosed).toBe(false);
    expect(after.responsibleSignatureImage).toBeNull();
    expect(after.officerSignatureImage).toBeNull();
    expect(after.responsibleName).toBe('ישראל ישראלי');
    expect(after.officerPn).toBe('7654321');

    const log = await prisma.countSessionReopen.findMany({
      where: { countSessionId: sessionId },
      include: { reopenedBy: true },
    });
    expect(log).toHaveLength(1);
    expect(log[0]?.reason).toBe('נסגר בטעות לפני סיום');
    expect(log[0]?.reopenedBy.username).toBe(ADMIN.username);
  });

  it('refuses to reopen a count that is not closed', async () => {
    sessionId = await closedSession();
    await reopen(adminJar, { reason: 'בדיקה ראשונה' }).expect(201);
    await reopen(adminJar, { reason: 'בדיקה שנייה' }).expect(400);
  });

  it('shows the last reopening on the sheet, and the count can be signed and closed again', async () => {
    sessionId = await closedSession();
    await reopen(adminJar, { reason: 'תיקון כמות' }).expect(201);

    const sheet = await request(app.getHttpServer())
      .get('/api/counts/sheet')
      .query({ date: DAY, shift: 'EVENING' })
      .set('Cookie', staffJar)
      .expect(200);
    expect(sheet.body.session.lastReopen.reason).toBe('תיקון כמות');
    expect(sheet.body.session.lastReopen.by).toBe('מנהל ספירה');

    // Closing without the signatures is refused...
    await request(app.getHttpServer()).post(`/api/counts/${sessionId}/close`).set('Cookie', staffJar).expect(400);

    // ...and works once both sides have signed again.
    await request(app.getHttpServer())
      .post('/api/counts')
      .set('Cookie', staffJar)
      .send({
        sessionDate: DAY,
        shift: 'EVENING',
        responsibleName: 'ישראל ישראלי',
        responsiblePn: '1234567',
        responsibleRank: 'רס"ל',
        responsibleSignatureImage: PNG,
        officerName: 'משה כהן',
        officerPn: '7654321',
        officerRank: 'סגן',
        officerSignatureImage: PNG,
      })
      .expect(201);
    await request(app.getHttpServer()).post(`/api/counts/${sessionId}/close`).set('Cookie', staffJar).expect(201);
    expect((await prisma.countSession.findUniqueOrThrow({ where: { id: sessionId } })).isClosed).toBe(true);
  });
});
