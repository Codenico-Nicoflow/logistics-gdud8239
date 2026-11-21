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
import ExcelJS from 'exceljs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const ADMIN = { username: 'e2e_count_admin', password: 'e2e-count-admin-123' };
const STAFF = { username: 'e2e_count_staff', password: 'e2e-count-staff-123' };
/** A date no real count will ever use, so this cannot touch real data. */
const DAY = '2031-03-14';
const NEXT = '2031-03-15';
const ITEM = 'E2E פריט ספירה';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let app: INestApplication;
let prisma: PrismaService;
let adminJar: string;
let staffJar: string;
let sessionId: string;

const cookie = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');

async function cleanup(): Promise<void> {
  await prisma.countSession.deleteMany({ where: { sessionDate: { in: [new Date(DAY), new Date(NEXT)] } } });
  await prisma.dailySummaryLine.deleteMany({ where: { item: { name: ITEM } } });
  await prisma.item.deleteMany({ where: { name: ITEM } });
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

async function openSession(date: string, shift: 'EVENING' | 'MORNING', name: string, closed = true) {
  const staff = await prisma.user.findUniqueOrThrow({ where: { username: STAFF.username } });
  return prisma.countSession.create({
    data: {
      sessionDate: new Date(date),
      shift,
      isClosed: closed,
      recordedByUserId: staff.id,
      responsibleName: name,
      officerName: `${name}-קצין`,
    },
  });
}

describe('a night is the evening plus the morning after', () => {
  const sheet = (date: string, shift: 'EVENING' | 'MORNING') =>
    request(app.getHttpServer()).get('/api/counts/sheet').query({ date, shift }).set('Cookie', staffJar).expect(200);

  it("a morning count signs the previous day's מסכם figure, not its own empty one", async () => {
    await cleanup();
    const staff = await prisma.user.findUniqueOrThrow({ where: { username: STAFF.username } });
    const item = await prisma.item.create({ data: { name: ITEM, category: 'GEAR', isSerialized: false, authorizedQty: 5 } });
    await prisma.dailySummaryLine.create({
      data: { sessionDate: new Date(DAY), itemId: item.id, nashkiyaQty: 7, updatedByUserId: staff.id },
    });
    await prisma.dailySummaryLine.create({
      data: { sessionDate: new Date(NEXT), itemId: item.id, nashkiyaQty: 99, updatedByUserId: staff.id },
    });

    const evening = await sheet(DAY, 'EVENING');
    const morning = await sheet(NEXT, 'MORNING');
    const pick = (b: { rows: { itemName: string; nashkiyaQty: number | null }[] }) =>
      b.rows.find((r) => r.itemName === ITEM)?.nashkiyaQty;

    expect(evening.body.figureDate).toBe(DAY);
    expect(pick(evening.body)).toBe(7);
    expect(morning.body.figureDate).toBe(DAY);
    expect(pick(morning.body)).toBe(7); // not 99, the next day's figure
  });

  async function countSheetRows(): Promise<{ header: string; names: [unknown, unknown] }> {
    const res = await request(app.getHttpServer())
      .get('/api/excel/export')
      .set('Cookie', staffJar)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.getWorksheet('ספירת נשקיה');
    if (!ws) throw new Error('no ספירת נשקיה sheet');
    let header = '';
    let names: [unknown, unknown] = [null, null];
    ws.eachRow((row) => {
      const first = String(row.getCell(1).value ?? '');
      if (String(row.getCell(2).value ?? '').startsWith('ספירת ערב ·')) {
        header = `${row.getCell(2).value} | ${row.getCell(3).value}`;
      }
      if (first === 'שם ומשפחה' && names[0] === null) names = [row.getCell(2).value, row.getCell(3).value];
    });
    return { header, names };
  }

  it('the Excel sheet shows the evening and the morning after it side by side', async () => {
    await cleanup();
    await openSession(DAY, 'EVENING', 'ערב-שם');
    await openSession(NEXT, 'MORNING', 'בוקר-שם');
    const { header, names } = await countSheetRows();
    expect(header).toBe('ספירת ערב · 14.03 | ספירת בוקר · 15.03');
    expect(names).toEqual(['ערב-שם', 'בוקר-שם']);
  });

  it('with only an evening, the morning after is pending', async () => {
    await cleanup();
    await openSession(DAY, 'EVENING', 'ערב-שם');
    const { header, names } = await countSheetRows();
    expect(header).toBe('ספירת ערב · 14.03 | ספירת בוקר · 15.03');
    expect(names).toEqual(['ערב-שם', '—']);
  });

  it('with only a morning, the evening before it is the missing half', async () => {
    await cleanup();
    await openSession(NEXT, 'MORNING', 'בוקר-שם');
    const { header, names } = await countSheetRows();
    expect(header).toBe('ספירת ערב · 14.03 | ספירת בוקר · 15.03');
    expect(names).toEqual(['—', 'בוקר-שם']);
  });
});
