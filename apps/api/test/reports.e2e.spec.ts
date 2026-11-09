/**
 * Which items appear in מסכם, and the ספירת נשקיה sheet derived from it.
 *
 * The catalog carries entries nobody counts nightly — priced gear, zero-stock
 * spares — so an admin chooses per item whether it is tracked. The guarantee
 * worth testing is that מסכם and the count sheet read the SAME list: removing
 * an item from the summary must remove it from the evening count, or the two
 * drift apart exactly the way the hand-kept spreadsheets did.
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

const ADMIN = { username: 'e2e_rep_admin', password: 'e2e-rep-admin-123' };
const STAFF = { username: 'e2e_rep_staff', password: 'e2e-rep-staff-123' };

const TRACKED = 'E2E פריט נספר';
const UNTRACKED = 'E2E פריט לא נספר';

let app: INestApplication;
let prisma: PrismaService;
let adminJar: string;
let staffJar: string;
let trackedId: string;
let untrackedId: string;

function jarFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function login(creds: { username: string; password: string }): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(creds).expect(200);
  return jarFrom(res);
}

async function cleanup(): Promise<void> {
  const items = await prisma.item.findMany({
    where: { name: { in: [TRACKED, UNTRACKED] } },
    select: { id: true },
  });
  const itemIds = items.map((i) => i.id);
  if (itemIds.length) {
    await prisma.countLine.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
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

  await prisma.user.deleteMany({ where: { username: { in: [ADMIN.username, STAFF.username] } } });
  await prisma.user.create({
    data: {
      username: ADMIN.username,
      displayName: 'מנהל דוחות',
      role: 'admin',
      passwordHash: await bcrypt.hash(ADMIN.password, 12),
    },
  });
  await prisma.user.create({
    data: {
      username: STAFF.username,
      displayName: 'לוגיסטיקה',
      role: 'logistics',
      passwordHash: await bcrypt.hash(STAFF.password, 12),
    },
  });

  adminJar = await login(ADMIN);
  staffJar = await login(STAFF);
});

afterAll(async () => {
  await cleanup();
  await prisma?.user.deleteMany({
    where: { username: { in: [ADMIN.username, STAFF.username] } },
  });
  await app?.close();
});

beforeEach(async () => {
  await cleanup();
  const tracked = await prisma.item.create({
    data: {
      name: TRACKED,
      category: 'OPTICS',
      isSerialized: false,
      authorizedQty: 7,
      inSummary: true,
    },
  });
  const untracked = await prisma.item.create({
    data: {
      name: UNTRACKED,
      category: 'GEAR',
      isSerialized: false,
      authorizedQty: 0,
      inSummary: false,
    },
  });
  trackedId = tracked.id;
  untrackedId = untracked.id;
});

async function summaryNames(jar: string): Promise<string[]> {
  const res = await request(app.getHttpServer())
    .get('/api/reports/summary')
    .set('Cookie', jar)
    .expect(200);
  return (res.body as { itemName: string }[]).map((r) => r.itemName);
}

async function countSheetNames(jar: string): Promise<string[]> {
  const res = await request(app.getHttpServer())
    .get('/api/counts/sheet?date=2026-11-09&shift=EVENING')
    .set('Cookie', jar)
    .expect(200);
  return (res.body.rows as { itemName: string }[]).map((r) => r.itemName);
}

describe('מסכם — which items are listed', () => {
  it('lists an item flagged inSummary and omits one that is not', async () => {
    const names = await summaryNames(staffJar);
    expect(names).toContain(TRACKED);
    expect(names).not.toContain(UNTRACKED);
  });

  it('gives ספירת נשקיה exactly the same list', async () => {
    // One list maintained once. If these ever diverge, the evening count is
    // being taken against a different set of items than the summary reports.
    expect(await countSheetNames(staffJar)).toEqual(await summaryNames(staffJar));
  });

  it('drops an item from both views the moment an admin clears the flag', async () => {
    await request(app.getHttpServer())
      .patch(`/api/items/${trackedId}`)
      .set('Cookie', adminJar)
      .send({ inSummary: false })
      .expect(200);

    expect(await summaryNames(staffJar)).not.toContain(TRACKED);
    expect(await countSheetNames(staffJar)).not.toContain(TRACKED);
  });

  it('brings an item back into both views when the flag is set again', async () => {
    await request(app.getHttpServer())
      .patch(`/api/items/${untrackedId}`)
      .set('Cookie', adminJar)
      .send({ inSummary: true })
      .expect(200);

    expect(await summaryNames(staffJar)).toContain(UNTRACKED);
    expect(await countSheetNames(staffJar)).toContain(UNTRACKED);
  });

  it('still shows a cleared item in the catalog, which is not the summary', async () => {
    // Clearing the flag is not deactivation: the item is still signable and
    // still appears in קטלוג פריטים. Only the counted list shrinks.
    const res = await request(app.getHttpServer())
      .get('/api/items')
      .set('Cookie', staffJar)
      .expect(200);
    const names = (res.body as { name: string }[]).map((i) => i.name);
    expect(names).toContain(UNTRACKED);
  });
});
