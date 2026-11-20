/**
 * קליטת ציוד — registering stock that arrived at the armory, as serials
 * or as a bulk quantity bump, before any of it can be assigned or signed out.
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

const ADMIN = { username: 'e2e_intake_admin', password: 'e2e-intake-admin-123' };
const STAFF = { username: 'e2e_intake_staff', password: 'e2e-intake-staff-123' };
const SERIALIZED_ITEM = 'E2E רובה קליטה';
const BULK_ITEM = 'E2E כוונת קליטה';

let app: INestApplication;
let prisma: PrismaService;
let adminJar: string;
let staffJar: string;
let serializedId: string;
let bulkId: string;

async function cleanup(): Promise<void> {
  const items = await prisma.item.findMany({
    where: { name: { in: [SERIALIZED_ITEM, BULK_ITEM] } },
    select: { id: true },
  });
  const itemIds = items.map((i) => i.id);
  await prisma.itemInstance.deleteMany({ where: { itemId: { in: itemIds } } });
  await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.user.deleteMany({ where: { username: { in: [ADMIN.username, STAFF.username] } } });
  await prisma.user.create({
    data: {
      username: ADMIN.username,
      displayName: 'מנהל הבדיקה',
      role: 'admin',
      passwordHash: await bcrypt.hash(ADMIN.password, 12),
    },
  });
  await prisma.user.create({
    data: {
      username: STAFF.username,
      displayName: 'מנפק הבדיקה',
      role: 'logistics',
      passwordHash: await bcrypt.hash(STAFF.password, 12),
    },
  });

  const adminRes = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);
  adminJar = (adminRes.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
  const staffRes = await request(app.getHttpServer()).post('/api/auth/login').send(STAFF).expect(200);
  staffJar = (staffRes.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
});

afterAll(async () => {
  await cleanup();
  await prisma?.user.updateMany({
    where: { username: { in: [ADMIN.username, STAFF.username] } },
    data: { isActive: false },
  });
  await app?.close();
});

beforeEach(async () => {
  await cleanup();
  const serialized = await prisma.item.create({
    data: { name: SERIALIZED_ITEM, category: 'WEAPON', isSerialized: true, authorizedQty: 0 },
  });
  const bulk = await prisma.item.create({
    data: { name: BULK_ITEM, category: 'OPTICS', isSerialized: false, authorizedQty: 5 },
  });
  serializedId = serialized.id;
  bulkId = bulk.id;
});

function post(body: object, jar: string) {
  return request(app.getHttpServer()).post('/api/intake').set('Cookie', jar).send(body);
}

describe('קליטת ציוד', () => {
  it('registers serials and bumps bulk quantity in one submit', async () => {
    const res = await post(
      {
        rows: [
          { itemId: serializedId, kind: 'serial', serial: 'INTAKE-1' },
          { itemId: serializedId, kind: 'serial', serial: 'INTAKE-2' },
          { itemId: bulkId, kind: 'bulk', quantity: 10 },
        ],
      },
      adminJar,
    ).expect(201);

    expect(res.body.serialsCreated).toBe(2);
    expect(res.body.serialsSkipped).toBe(0);
    expect(res.body.bulkItemsUpdated).toBe(1);

    const instances = await prisma.itemInstance.findMany({ where: { itemId: serializedId } });
    expect(instances).toHaveLength(2);
    expect(instances.every((i) => i.status === 'OK')).toBe(true);

    const bulkItem = await prisma.item.findUniqueOrThrow({ where: { id: bulkId } });
    expect(bulkItem.authorizedQty).toBe(15);
  });

  it('skips a serial that already exists rather than failing the batch', async () => {
    await prisma.itemInstance.create({ data: { itemId: serializedId, serial: 'INTAKE-DUP', status: 'OK' } });

    const res = await post(
      { rows: [{ itemId: serializedId, kind: 'serial', serial: 'INTAKE-DUP' }] },
      adminJar,
    ).expect(201);

    expect(res.body.serialsCreated).toBe(0);
    expect(res.body.serialsSkipped).toBe(1);
  });

  it('refuses a serial row with no serial', async () => {
    await post({ rows: [{ itemId: serializedId, kind: 'serial' }] }, adminJar).expect(400);
  });

  it('refuses a bulk row with no quantity', async () => {
    await post({ rows: [{ itemId: bulkId, kind: 'bulk' }] }, adminJar).expect(400);
  });

  it('refuses a bulk row for an item that requires a מסד', async () => {
    await post({ rows: [{ itemId: serializedId, kind: 'bulk', quantity: 5 }] }, adminJar).expect(
      400,
    );
  });

  it('is admin-only', async () => {
    await post(
      { rows: [{ itemId: serializedId, kind: 'serial', serial: 'INTAKE-3' }] },
      staffJar,
    ).expect(403);
  });
});
