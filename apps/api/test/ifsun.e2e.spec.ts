/**
 * אפסון: a soldier leaves a signed item in the armory.
 *
 * The invariant that matters is the count: a stored weapon is still signed but
 * on the shelf, so מסכם must move it from מנופק to the armory side — otherwise
 * the nightly ספירה shows a phantom spare weapon.
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
import ExcelJS from 'exceljs';
import { ExcelExportService } from '../src/excel/excel-export.service';
import { israelToday } from '../src/common/israel-date';

const STAFF = { username: 'e2e_ifsun_staff', password: 'e2e-ifsun-staff-123' };
const VIEWER = { username: 'e2e_ifsun_viewer', password: 'e2e-ifsun-viewer-123' };
const LAST = 'E2E-אפסון';
const ITEM = 'E2E נשק אפסון';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

let app: INestApplication;
let prisma: PrismaService;
let jar: string;
let viewerJar: string;
let itemId: string;
let sigId: string;
let soldierId: string;

async function login(u: { username: string; password: string }): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(u).expect(200);
  return (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
}

async function cleanup(): Promise<void> {
  const soldiers = await prisma.soldier.findMany({ where: { lastName: LAST }, select: { id: true } });
  const ids = soldiers.map((s) => s.id);
  if (ids.length) {
    await prisma.ifsunRecord.deleteMany({ where: { soldierId: { in: ids } } });
    await ownerExec('ALTER TABLE movements DISABLE TRIGGER USER');
    await prisma.movement.deleteMany({ where: { soldierId: { in: ids } } });
    await ownerExec('ALTER TABLE movements ENABLE TRIGGER USER');
    await prisma.signature.deleteMany({ where: { soldierId: { in: ids } } });
    await prisma.soldier.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.item.deleteMany({ where: { name: ITEM } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.user.deleteMany({ where: { username: { in: [STAFF.username, VIEWER.username] } } });
  for (const [u, role] of [[STAFF, 'logistics'], [VIEWER, 'viewer']] as const) {
    await prisma.user.create({
      data: { username: u.username, displayName: 'בודק אפסון', role, passwordHash: await bcrypt.hash(u.password, 12) },
    });
  }
  jar = await login(STAFF);
  viewerJar = await login(VIEWER);
});

afterAll(async () => {
  await cleanup();
  await prisma?.user.deleteMany({ where: { username: { in: [STAFF.username, VIEWER.username] } } });
  await app?.close();
});

beforeEach(async () => {
  await cleanup();
  const item = await prisma.item.create({
    data: { name: ITEM, category: 'WEAPON', isSerialized: false, authorizedQty: 10, inSummary: true, ifsunAllowed: true },
  });
  itemId = item.id;
  const soldier = await prisma.soldier.create({ data: { firstName: 'מאפסן', lastName: LAST, company: 'A' } });
  soldierId = soldier.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { username: STAFF.username } });
  const sig = await prisma.signature.create({ data: { soldierId, itemId, quantity: 1, signedByUserId: user.id } });
  sigId = sig.id;
});

const post = (path: string, body: object = {}, cookie = jar) =>
  request(app.getHttpServer()).post(`/api/${path}`).set('Cookie', cookie).send(body);

async function mesakemRow(): Promise<{ issued: number; stored: number }> {
  const res = await request(app.getHttpServer())
    .get(`/api/mesakem/sheet?date=${israelToday()}`)
    .set('Cookie', jar)
    .expect(200);
  return res.body.rows.find((r: { itemName: string }) => r.itemName === ITEM);
}

describe('אפסון', () => {
  it('moves a stored unit from מנופק to the armory side of מסכם, and writes a תנועה', async () => {
    expect(await mesakemRow()).toMatchObject({ issued: 1, stored: 0 });

    await post('ifsun', { signatureId: sigId, signatureImage: PNG }).expect(201);
    expect(await mesakemRow()).toMatchObject({ issued: 0, stored: 1 });

    const sig = await prisma.signature.findUniqueOrThrow({ where: { id: sigId } });
    expect(sig.returnedAt).toBeNull();
    const mv = await prisma.movement.findMany({ where: { signatureId: sigId, action: 'STORE' } });
    expect(mv).toHaveLength(1);
  });

  it('refuses to store the same unit twice', async () => {
    await post('ifsun', { signatureId: sigId, signatureImage: PNG }).expect(201);
    await post('ifsun', { signatureId: sigId, signatureImage: PNG }).expect(409);
  });

  it('collect puts the unit back out and logs it', async () => {
    const rec = (await post('ifsun', { signatureId: sigId, signatureImage: PNG }).expect(201)).body;
    await post(`ifsun/${rec.id}/collect`, { signatureImage: PNG }).expect(201);
    expect(await mesakemRow()).toMatchObject({ issued: 1, stored: 0 });
    expect(await prisma.movement.count({ where: { signatureId: sigId, action: 'COLLECT' } })).toBe(1);
    await post(`ifsun/${rec.id}/collect`, { signatureImage: PNG }).expect(409);
  });

  it('credit closes the record and the signature, with a זיכוי movement', async () => {
    const rec = (await post('ifsun', { signatureId: sigId, signatureImage: PNG }).expect(201)).body;
    await post(`ifsun/${rec.id}/credit`).expect(201);
    const sig = await prisma.signature.findUniqueOrThrow({ where: { id: sigId } });
    expect(sig.returnedAt).not.toBeNull();
    expect(await prisma.movement.count({ where: { signatureId: sigId, action: 'RETURN' } })).toBe(1);
    expect(await mesakemRow()).toMatchObject({ issued: 0, stored: 0 });
  });

  it('a stored signature cannot be returned directly', async () => {
    await post('ifsun', { signatureId: sigId, signatureImage: PNG }).expect(201);
    await post(`signatures/${sigId}/return`).expect(400);
  });

  it('filters history by the day it was stored and pages the result', async () => {
    await post('ifsun', { signatureId: sigId, signatureImage: PNG }).expect(201);
    const today = israelToday();
    const hit = await request(app.getHttpServer())
      .get(`/api/ifsun?status=ALL&from=${today}&to=${today}&take=1&skip=0&q=${encodeURIComponent(LAST)}`)
      .set('Cookie', jar)
      .expect(200);
    expect(hit.body.total).toBe(1);
    expect(hit.body.rows).toHaveLength(1);
    const past = await request(app.getHttpServer())
      .get(`/api/ifsun?status=ALL&to=2020-01-01&q=${encodeURIComponent(LAST)}`)
      .set('Cookie', jar)
      .expect(200);
    expect(past.body.total).toBe(0);
  });

  it('puts closed records and signer names in the Excel backup, not just what is stored now', async () => {
    const rec = (await post('ifsun', { signatureId: sigId, signatureImage: PNG }).expect(201)).body;
    await post(`ifsun/${rec.id}/collect`, { signatureImage: PNG, signerName: 'אחיו של החייל' }).expect(201);

    const wb = await app.get(ExcelExportService).build();
    const ws = wb.getWorksheet('אפסון');
    const cells: string[] = [];
    ws?.eachRow((row) => row.eachCell((c) => cells.push(String(c.value ?? ''))));
    expect(cells).toContain('אחיו של החייל');
    expect(cells).toContain('נלקח');
    expect(cells).toContain('הפקדה + לקיחה');
    expect(wb).toBeInstanceOf(ExcelJS.Workbook);
  });

  it('serves a printable page with both signatures and escapes names', async () => {
    const rec = (await post('ifsun', { signatureId: sigId, signatureImage: PNG, signerName: '<b>x</b>' }).expect(201)).body;
    const res = await request(app.getHttpServer()).get(`/api/ifsun/${rec.id}/print`).set('Cookie', jar).expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain(PNG);
    expect(res.text).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(res.text).not.toContain('<b>x</b>');
    await request(app.getHttpServer()).get(`/api/ifsun/${rec.id}/print`).set('Cookie', viewerJar).expect(403);
  });

  it('refuses an item that is not marked storable, and accepts it once an admin allows it', async () => {
    await prisma.item.update({ where: { id: itemId }, data: { category: 'ACCESSORY', ifsunAllowed: false } });
    await post('ifsun', { signatureId: sigId, signatureImage: PNG }).expect(400);
    await prisma.item.update({ where: { id: itemId }, data: { ifsunAllowed: true } });
    await post('ifsun', { signatureId: sigId, signatureImage: PNG }).expect(201);
  });

  it('keeps both signed halves, and names who collected when it was not the soldier', async () => {
    const rec = (await post('ifsun', { signatureId: sigId, signatureImage: PNG }).expect(201)).body;
    expect(rec.storeSignerName).toBe(`מאפסן ${LAST}`);
    await post(`ifsun/${rec.id}/collect`, { signatureImage: PNG, signerName: 'חבר של החייל' }).expect(201);

    const detail = (await request(app.getHttpServer()).get(`/api/ifsun/${rec.id}`).set('Cookie', jar).expect(200)).body;
    expect(detail.storeSignatureImage).toBe(PNG);
    expect(detail.collectSignatureImage).toBe(PNG);
    expect(detail.collectSignerName).toBe('חבר של החייל');

    // The list stays light: images only come with the detail.
    const list = (await request(app.getHttpServer()).get('/api/ifsun?status=ALL').set('Cookie', jar).expect(200)).body;
    expect(list.rows[0].storeSignatureImage).toBeUndefined();
  });

  it('requires a signature to store and to collect', async () => {
    await post('ifsun', { signatureId: sigId }).expect(400);
    const rec = (await post('ifsun', { signatureId: sigId, signatureImage: PNG }).expect(201)).body;
    await post(`ifsun/${rec.id}/collect`, {}).expect(400);
  });

  it('is closed to viewers', async () => {
    await request(app.getHttpServer()).get('/api/ifsun').set('Cookie', viewerJar).expect(403);
    await post('ifsun', { signatureId: sigId, signatureImage: PNG }, viewerJar).expect(403);
  });

  it('lists what is stored with its history on request', async () => {
    const rec = (await post('ifsun', { signatureId: sigId, signatureImage: PNG }).expect(201)).body;
    await post(`ifsun/${rec.id}/collect`, { signatureImage: PNG }).expect(201);
    const open = await request(app.getHttpServer()).get('/api/ifsun').set('Cookie', jar).expect(200);
    expect(open.body.rows.filter((r: { soldierId: string }) => r.soldierId === soldierId)).toHaveLength(0);
    const all = await request(app.getHttpServer()).get('/api/ifsun?status=ALL').set('Cookie', jar).expect(200);
    expect(all.body.rows.filter((r: { soldierId: string }) => r.soldierId === soldierId)).toHaveLength(1);
  });
});
