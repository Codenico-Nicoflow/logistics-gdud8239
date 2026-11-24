/**
 * A unit sent for repair that comes back as a different one (it could not be fixed).
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

const ADMIN = { username: 'e2e_replace_admin', password: 'e2e-replace-admin-123' };
const PREFIX = 'E2ES ';

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
    data: { username: ADMIN.username, displayName: 'מנהל החלפות', role: 'admin', passwordHash: await bcrypt.hash(ADMIN.password, 12) },
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
const replace = (id: string, body: object) => call.post(`/items/${id}/replace-repaired`, body);

describe('a unit that came back as a different one', () => {
  it('serialized: the old מסד leaves the books and the new one takes its place', async () => {
    const id = (await newItem('rifle', { isSerialized: true, authorizedQty: 0 }).expect(201)).body.id;
    await call.post(`/items/${id}/instances`, { serial: 'OLD1' }).expect(201);
    await call.post(`/items/${id}/instances`, { serial: 'KEEP' }).expect(201);
    const old = (await call.get(`/items/${id}`).expect(200)).body;
    expect(old.authorizedQty).toBe(2);

    // Not in repair yet: refused.
    await replace(id, { oldSerial: 'OLD1', newSerial: 'NEW1' }).expect(400);

    const inst = await prisma.itemInstance.findFirstOrThrow({ where: { itemId: id, serial: 'OLD1' } });
    await call.patch(`/items/instances/${inst.id}/status`, { status: 'IN_REPAIR' }).expect(200);
    await replace(id, { oldSerial: 'OLD1', newSerial: 'NEW1', notes: 'לא ניתן לתיקון' }).expect(201);

    const serials = (await prisma.itemInstance.findMany({ where: { itemId: id }, orderBy: { serial: 'asc' } })).map((i) => [i.serial, i.status]);
    expect(serials).toEqual([['KEEP', 'OK'], ['NEW1', 'OK']]);
    const after = await find(id);
    expect(after.authorizedQty).toBe(2);
    expect(after.repairQty).toBe(0);
    expect(after.repairSerials).toEqual([]);
    const log = (await call.get(`/items/${id}/replacements`).expect(200)).body;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ oldSerial: 'OLD1', newSerial: 'NEW1', notes: 'לא ניתן לתיקון' });
  });

  it('refuses a new מסד that already exists, or the same one', async () => {
    const id = (await newItem('dup', { isSerialized: true, authorizedQty: 0 }).expect(201)).body.id;
    await call.post(`/items/${id}/instances`, { serial: 'A1', status: 'IN_REPAIR' }).expect(201);
    await call.post(`/items/${id}/instances`, { serial: 'B1' }).expect(201);
    await replace(id, { oldSerial: 'A1', newSerial: 'B1' }).expect(409);
    await replace(id, { oldSerial: 'A1', newSerial: 'A1' }).expect(400);
    await replace(id, { newSerial: 'C1' }).expect(400);
  });

  it('bulk: drops the old מסד from the repair list and one from the count, and registers the new one', async () => {
    const id = (await newItem('bulk', { isSerialized: false, authorizedQty: 5, repairQty: 3, repairSerials: ['X1', 'X2'] }).expect(201)).body.id;
    await replace(id, { oldSerial: 'NOPE', newSerial: 'Y1' }).expect(400);
    await replace(id, { oldSerial: 'X1', newSerial: 'Y1' }).expect(201);
    const after = await find(id);
    expect(after.repairQty).toBe(2);
    expect(after.repairSerials).toEqual(['X2']);
    expect(after.authorizedQty).toBe(5);
    expect(await prisma.itemInstance.count({ where: { itemId: id, serial: 'Y1' } })).toBe(1);

    // A unit that never had a מסד can be replaced too.
    await replace(id, { newSerial: 'Y2' }).expect(201);
    expect((await find(id)).repairQty).toBe(1);
  });

  it('bulk: refuses when nothing is in repair', async () => {
    const id = (await newItem('none', { isSerialized: false, authorizedQty: 2 }).expect(201)).body.id;
    await replace(id, { newSerial: 'Z1' }).expect(400);
  });

  it('the log cannot be edited or deleted', async () => {
    const id = (await newItem('log', { isSerialized: false, authorizedQty: 2, repairQty: 1 }).expect(201)).body.id;
    await replace(id, { newSerial: 'L1' }).expect(201);
    await expect(prisma.itemReplacement.deleteMany({ where: { itemId: id } })).rejects.toThrow();
  });
});
