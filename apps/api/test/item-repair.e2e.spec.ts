/**
 * בתיקון — which units of an item are in repair.
 *
 * A serialized item's repair list IS its מסדים marked IN_REPAIR (derived, never typed, so it cannot disagree
 * with the מסדים dialog). A bulk item keeps a typed count and, beside it, the מסדים of those units, never
 * more of them than the count.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { appValidationPipe } from '../src/common/validation-pipe';
import { PrismaService } from '../src/prisma/prisma.service';

const ADMIN = { username: 'e2e_repair_admin', password: 'e2e-repair-admin-123' };
const PREFIX = 'E2ER ';

let app: INestApplication;
let prisma: PrismaService;
let jar: string;

const call = {
  get: (url: string) => request(app.getHttpServer()).get(`/api${url}`).set('Cookie', jar),
  post: (url: string, body: object) => request(app.getHttpServer()).post(`/api${url}`).set('Cookie', jar).send(body),
  patch: (url: string, body: object) => request(app.getHttpServer()).patch(`/api${url}`).set('Cookie', jar).send(body),
};

const newItem = (name: string, extra: object) =>
  call.post('/items', { name: PREFIX + name, category: 'GEAR', authorizedQty: 10, ...extra });

async function cleanup(): Promise<void> {
  const items = await prisma.item.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const ids = items.map((i) => i.id);
  await prisma.itemInstance.deleteMany({ where: { itemId: { in: ids } } });
  await prisma.item.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(appValidationPipe());
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.user.deleteMany({ where: { username: ADMIN.username } });
  await prisma.user.create({
    data: { username: ADMIN.username, displayName: 'מנהל תיקונים', role: 'admin', passwordHash: await bcrypt.hash(ADMIN.password, 12) },
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);
  jar = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma?.user.deleteMany({ where: { username: ADMIN.username } });
  await app?.close();
});

const find = async (id: string) => (await call.get('/items').expect(200)).body.find((i: { id: string }) => i.id === id);

describe('a bulk item', () => {
  let id: string;

  it('keeps the typed count and the מסדים of the units in repair', async () => {
    const res = await newItem('נשק עזר', { isSerialized: false, repairQty: 3, repairSerials: ['A1', 'A2'] }).expect(201);
    id = res.body.id;
    expect(res.body.repairQty).toBe(3);
    expect(res.body.repairSerials).toEqual(['A1', 'A2']);
    expect((await find(id)).repairSerials).toEqual(['A1', 'A2']);
  });

  it('trims the מסדים and drops blanks', async () => {
    const res = await call.patch(`/items/${id}`, { repairSerials: ['  A1 ', '', '  ', 'A3'] }).expect(200);
    expect(res.body.repairSerials).toEqual(['A1', 'A3']);
  });

  it('refuses more מסדים than units in repair', async () => {
    const res = await call.patch(`/items/${id}`, { repairSerials: ['A1', 'A2', 'A3', 'A4'] }).expect(400);
    expect(res.body.message).toContain('3');
  });

  it('refuses the same מסד twice, whatever its case', async () => {
    await call.patch(`/items/${id}`, { repairSerials: ['ab-1', 'AB-1'] }).expect(400);
  });

  it('refuses lowering the count below the מסדים already listed, and allows it once they are trimmed', async () => {
    await call.patch(`/items/${id}`, { repairQty: 1 }).expect(400);
    const ok = await call.patch(`/items/${id}`, { repairQty: 1, repairSerials: ['A1'] }).expect(200);
    expect(ok.body.repairQty).toBe(1);
  });

  it('allows units in repair that have no מסד (the list may be shorter than the count)', async () => {
    const res = await call.patch(`/items/${id}`, { repairQty: 5 }).expect(200);
    expect(res.body.repairQty).toBe(5);
    expect(res.body.repairSerials).toEqual(['A1']);
  });

  it('refuses a list that is not strings, and an over-long מסד', async () => {
    await call.patch(`/items/${id}`, { repairSerials: [1, 2] }).expect(400);
    await call.patch(`/items/${id}`, { repairSerials: ['x'.repeat(61)] }).expect(400);
  });

  it('refuses a list on create that outgrows the count', async () => {
    await newItem('חריג', { isSerialized: false, repairQty: 1, repairSerials: ['B1', 'B2'] }).expect(400);
  });
});

describe('a serialized item', () => {
  let id: string;
  const instance: Record<string, string> = {};

  it('ignores a typed repair count and list: they are derived', async () => {
    const res = await newItem('רובה', { isSerialized: true, authorizedQty: 0, repairQty: 9, repairSerials: ['Z'] }).expect(201);
    id = res.body.id;
    expect(res.body.repairQty).toBe(0);
    expect(res.body.repairSerials).toEqual([]);
    await call.patch(`/items/${id}`, { repairQty: 7, repairSerials: ['Q'] }).expect(200);
    expect((await find(id)).repairQty).toBe(0);
  });

  it('lists exactly the מסדים marked בתיקון, in the item list and on the item itself', async () => {
    for (const serial of ['S-3', 'S-1', 'S-2']) {
      const r = await call.post(`/items/${id}/instances`, { serial }).expect(201);
      instance[serial] = r.body.id;
    }
    await call.patch(`/items/instances/${instance['S-3']}/status`, { status: 'IN_REPAIR' }).expect(200);
    await call.patch(`/items/instances/${instance['S-1']}/status`, { status: 'IN_REPAIR' }).expect(200);

    const listed = await find(id);
    expect(listed.repairQty).toBe(2);
    expect(listed.repairSerials).toEqual(['S-1', 'S-3']);
    const one = (await call.get(`/items/${id}`).expect(200)).body;
    expect(one.repairQty).toBe(2);
    expect(one.repairSerials).toEqual(['S-1', 'S-3']);
  });

  it('drops a מסד from the list when it comes back', async () => {
    await call.patch(`/items/instances/${instance['S-3']}/status`, { status: 'OK' }).expect(200);
    const listed = await find(id);
    expect(listed.repairQty).toBe(1);
    expect(listed.repairSerials).toEqual(['S-1']);
  });

  it('does not count a מסד that is faulty or disabled as in repair', async () => {
    await call.patch(`/items/instances/${instance['S-2']}/status`, { status: 'FAULTY' }).expect(200);
    expect((await find(id)).repairSerials).toEqual(['S-1']);
  });
});

describe('changing an item between bulk and serialized', () => {
  it('clears the typed list when a bulk item becomes serialized', async () => {
    const created = await newItem('הפיכה', { isSerialized: false, repairQty: 2, repairSerials: ['C1'] }).expect(201);
    const res = await call.patch(`/items/${created.body.id}`, { isSerialized: true }).expect(200);
    expect(res.body.repairQty).toBe(0);
    expect(res.body.repairSerials).toEqual([]);
    const stored = await prisma.item.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.repairSerials).toEqual([]);
  });
});
