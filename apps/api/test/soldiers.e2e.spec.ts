/**
 * The חיילים roster filters.
 *
 * These exist to find records that need work — someone missing a מ.א., or
 * holding nothing — so each one must count against the whole roster. A filter
 * that only narrows the rows already loaded would hide most of what it is
 * meant to surface, which is worse than not offering it.
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
import { ownerExec } from './owner';

const STAFF = { username: 'e2e_sol_staff', password: 'e2e-sol-staff-123' };
const LAST = 'E2E-רשימה';

let app: INestApplication;
let prisma: PrismaService;
let jar: string;
let itemId: string;
let holderId: string;

async function cleanup(): Promise<void> {
  const soldiers = await prisma.soldier.findMany({
    where: { lastName: LAST },
    select: { id: true },
  });
  const ids = soldiers.map((s) => s.id);
  if (ids.length) {
    await ownerExec('ALTER TABLE movements DISABLE TRIGGER USER');
    await prisma.movement.deleteMany({ where: { soldierId: { in: ids } } });
    await ownerExec('ALTER TABLE movements ENABLE TRIGGER USER');
    await prisma.signature.deleteMany({ where: { soldierId: { in: ids } } });
    await prisma.soldier.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.item.deleteMany({ where: { name: 'E2E פריט רשימה', signatures: { none: {} } } });
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
      displayName: 'בודק רשימה',
      role: 'logistics',
      passwordHash: await bcrypt.hash(STAFF.password, 12),
    },
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(STAFF).expect(200);
  jar = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
});

afterAll(async () => {
  await cleanup();
  await prisma?.user.deleteMany({ where: { username: STAFF.username } });
  await app?.close();
});

beforeEach(async () => {
  await cleanup();
  const item = await prisma.item.create({
    data: { name: 'E2E פריט רשימה', category: 'OPTICS', isSerialized: false, authorizedQty: 10 },
  });
  itemId = item.id;

  // Complete details, holding something.
  const holder = await prisma.soldier.create({
    data: {
      firstName: 'מחזיק',
      lastName: LAST,
      company: 'A',
      personalNumber: '8111101',
      phone: '050-1111111',
    },
  });
  holderId = holder.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { username: STAFF.username } });
  await prisma.signature.create({
    data: { soldierId: holder.id, itemId, quantity: 1, signedByUserId: user.id },
  });

  // Complete details, holding nothing.
  await prisma.soldier.create({
    data: {
      firstName: 'ריק',
      lastName: LAST,
      company: 'A',
      personalNumber: '8111102',
      phone: '050-2222222',
    },
  });

  // No מ.א., no phone.
  await prisma.soldier.create({ data: { firstName: 'חסר', lastName: LAST, company: 'B' } });
});

async function search(params: string): Promise<{ firstName: string }[]> {
  const res = await request(app.getHttpServer())
    .get(`/api/soldiers?take=200&q=${encodeURIComponent(LAST)}&${params}`)
    .set('Cookie', jar)
    .expect(200);
  return res.body.rows;
}

describe('רשימת חיילים — filters', () => {
  it('finds everyone when nothing is filtered', async () => {
    const names = (await search('')).map((s) => s.firstName).sort();
    expect(names).toEqual(['חסר', 'מחזיק', 'ריק']);
  });

  it('holding=with returns only soldiers signed on something', async () => {
    const names = (await search('holding=with')).map((s) => s.firstName);
    expect(names).toEqual(['מחזיק']);
  });

  it('holding=without returns only soldiers holding nothing', async () => {
    const names = (await search('holding=without')).map((s) => s.firstName).sort();
    expect(names).toEqual(['חסר', 'ריק']);
  });

  it('counts a soldier who returned everything as holding nothing', async () => {
    // A closed signature is history, not a holding: once the item is back the
    // soldier belongs in the "holds nothing" list.
    await prisma.signature.updateMany({
      where: { soldierId: holderId },
      data: { returnedAt: new Date() },
    });
    const names = (await search('holding=without')).map((s) => s.firstName).sort();
    expect(names).toEqual(['חסר', 'מחזיק', 'ריק']);
  });

  it('attachedOnly returns only מסופחים', async () => {
    await prisma.soldier.updateMany({ where: { id: holderId }, data: { isAttached: true } });
    const names = (await search('attachedOnly=true')).map((s) => s.firstName);
    expect(names).toEqual(['מחזיק']);
    expect((await search('')).length).toBe(3);
  });

  it('incompleteOnly returns soldiers missing a מ.א. or a phone', async () => {
    const names = (await search('incompleteOnly=true')).map((s) => s.firstName);
    expect(names).toEqual(['חסר']);
  });

  it('combines a search term with a filter rather than replacing it', async () => {
    // Both conditions must hold: the two OR groups must not collapse into one.
    const rows = await search('incompleteOnly=true&company=A');
    expect(rows).toHaveLength(0);
  });
});

describe('מסופח', () => {
  const create = (body: object) =>
    request(app.getHttpServer())
      .post('/api/soldiers')
      .set('Cookie', jar)
      .send({ firstName: 'מסופח', lastName: LAST, company: 'A', ...body });

  it('is off by default and can be set on create', async () => {
    const plain = await create({}).expect(201);
    const attached = await create({ isAttached: true }).expect(201);
    expect(plain.body.isAttached).toBe(false);
    expect(attached.body.isAttached).toBe(true);
  });

  it('can be switched on and off later, and the roster shows it', async () => {
    const made = await create({}).expect(201);
    const patch = (isAttached: boolean) =>
      request(app.getHttpServer()).patch(`/api/soldiers/${made.body.id}`).set('Cookie', jar).send({ isAttached });

    await patch(true).expect(200);
    const listed = await request(app.getHttpServer())
      .get('/api/soldiers')
      .query({ q: 'מסופח' })
      .set('Cookie', jar)
      .expect(200);
    const row = (listed.body.rows as { id: string; isAttached: boolean }[]).find((r) => r.id === made.body.id);
    expect(row?.isAttached).toBe(true);

    await patch(false).expect(200);
    expect((await prisma.soldier.findUniqueOrThrow({ where: { id: made.body.id } })).isAttached).toBe(false);
  });

  it('is not changed by an edit that leaves it out', async () => {
    const made = await create({ isAttached: true }).expect(201);
    await request(app.getHttpServer())
      .patch(`/api/soldiers/${made.body.id}`)
      .set('Cookie', jar)
      .send({ phone: '050-1234567' })
      .expect(200);
    expect((await prisma.soldier.findUniqueOrThrow({ where: { id: made.body.id } })).isAttached).toBe(true);
  });
});
