/**
 * ערכות — the kits an admin builds, what they pre-fill on a 1008, and the guards around them.
 *
 * Properties that matter: only an admin can edit a kit; a kit can never loop or nest past 3 levels; an
 * item that is still in a kit cannot be deleted or deactivated; every edit leaves a history row that
 * cannot be altered.
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

const ADMIN = { username: 'e2e_kits_admin', password: 'e2e-kits-admin-123' };
const STAFF = { username: 'e2e_kits_staff', password: 'e2e-kits-staff-123' };
const PREFIX = 'E2EK ';

let app: INestApplication;
let prisma: PrismaService;
let adminJar: string;
let staffJar: string;
const id: Record<string, string> = {};

async function login(u: { username: string; password: string }): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(u).expect(200);
  return (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
}

const api = (jar: string) => ({
  get: (url: string) => request(app.getHttpServer()).get(`/api${url}`).set('Cookie', jar),
  put: (url: string, body: object) => request(app.getHttpServer()).put(`/api${url}`).set('Cookie', jar).send(body),
  patch: (url: string, body: object) => request(app.getHttpServer()).patch(`/api${url}`).set('Cookie', jar).send(body),
  del: (url: string) => request(app.getHttpServer()).delete(`/api${url}`).set('Cookie', jar),
});

const line = (name: string, quantity: number, mode: 'ALWAYS' | 'IF_ALLOCATED' = 'ALWAYS') => ({
  itemId: id[name],
  quantity,
  mode,
});

async function cleanup(): Promise<void> {
  const items = await prisma.item.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const ids = items.map((i) => i.id);
  await prisma.itemKitLine.deleteMany({ where: { OR: [{ itemId: { in: ids } }, { kit: { baseItemId: { in: ids } } }] } });
  await prisma.itemKit.deleteMany({ where: { baseItemId: { in: ids } } });
  await prisma.item.deleteMany({ where: { id: { in: ids } } });
  // Append-only by trigger: lift it for this transaction only, as the e2e cleanup script does.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`ALTER TABLE item_kit_changes DISABLE TRIGGER item_kit_changes_no_update_delete`;
    await tx.itemKitChange.deleteMany({ where: { baseItemName: { startsWith: PREFIX } } });
    await tx.$executeRaw`ALTER TABLE item_kit_changes ENABLE TRIGGER item_kit_changes_no_update_delete`;
  });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(appValidationPipe());
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.user.deleteMany({ where: { username: { in: [ADMIN.username, STAFF.username] } } });
  await prisma.user.create({
    data: { username: ADMIN.username, displayName: 'מנהל ערכות', role: 'admin', passwordHash: await bcrypt.hash(ADMIN.password, 12) },
  });
  await prisma.user.create({
    data: { username: STAFF.username, displayName: 'לוגיסטיקה', role: 'logistics', passwordHash: await bcrypt.hash(STAFF.password, 12) },
  });
  adminJar = await login(ADMIN);
  staffJar = await login(STAFF);

  await cleanup();
  for (const n of ['רובה', 'מחסנית', 'אופטיקה', 'נרתיק', 'כדור', 'עמוק1', 'עמוק2', 'עמוק3', 'מושבת']) {
    const created = await prisma.item.create({
      data: { name: PREFIX + n, category: 'GEAR', isSerialized: false, isActive: n !== 'מושבת' },
    });
    id[n] = created.id;
  }
  // The `line()` helper looks items up by short name, the API by catalog name.
});

afterAll(async () => {
  await cleanup();
  await prisma?.user.deleteMany({ where: { username: { in: [ADMIN.username, STAFF.username] } } });
  await app?.close();
});

describe('access', () => {
  it('refuses a non-admin on every kit route', async () => {
    const staff = api(staffJar);
    await staff.get('/item-kits').expect(403);
    await staff.get(`/item-kits/${id['רובה']}`).expect(403);
    await staff.get(`/item-kits/${id['רובה']}/history`).expect(403);
    await staff.put(`/item-kits/${id['רובה']}`, { lines: [] }).expect(403);
  });
});

describe('saving a kit', () => {
  it('saves lines in order and reads them back', async () => {
    const admin = api(adminJar);
    await admin.put(`/item-kits/${id['רובה']}`, { lines: [line('מחסנית', 5), line('אופטיקה', 1, 'IF_ALLOCATED')] }).expect(200);
    const res = await admin.get(`/item-kits/${id['רובה']}`).expect(200);
    expect(res.body.lines.map((l: { item: { name: string }; quantity: number; mode: string }) => [l.item.name, l.quantity, l.mode])).toEqual([
      [PREFIX + 'מחסנית', 5, 'ALWAYS'],
      [PREFIX + 'אופטיקה', 1, 'IF_ALLOCATED'],
    ]);
  });

  it('answers an item with no kit with no lines, not a 404', async () => {
    const res = await api(adminJar).get(`/item-kits/${id['כדור']}`).expect(200);
    expect(res.body.lines).toEqual([]);
  });

  it('refuses a duplicate line, the base item itself, a missing item, a bad quantity and an unknown mode', async () => {
    const admin = api(adminJar);
    const url = `/item-kits/${id['רובה']}`;
    await admin.put(url, { lines: [line('מחסנית', 1), line('מחסנית', 2)] }).expect(400);
    await admin.put(url, { lines: [line('רובה', 1)] }).expect(400);
    await admin.put(url, { lines: [{ itemId: '00000000-0000-4000-8000-000000000000', quantity: 1, mode: 'ALWAYS' }] }).expect(400);
    await admin.put(url, { lines: [{ ...line('מחסנית', 1), quantity: 0 }] }).expect(400);
    await admin.put(url, { lines: [{ ...line('מחסנית', 1), quantity: 100 }] }).expect(400);
    await admin.put(url, { lines: [{ ...line('מחסנית', 1), mode: 'SOMETIMES' }] }).expect(400);
    await admin.put(url, { lines: [{ ...line('מחסנית', 1), extra: true }] }).expect(400);
  });

  it('refuses an inactive item as a line', async () => {
    await api(adminJar).put(`/item-kits/${id['רובה']}`, { lines: [line('מושבת', 1)] }).expect(400);
  });

  it('a refused save leaves the kit as it was', async () => {
    const res = await api(adminJar).get(`/item-kits/${id['רובה']}`).expect(200);
    expect(res.body.lines).toHaveLength(2);
  });
});

describe('loops and depth', () => {
  it('refuses a kit that would close a loop', async () => {
    const res = await api(adminJar).put(`/item-kits/${id['מחסנית']}`, { lines: [line('רובה', 1)] }).expect(400);
    expect(res.body.message).toContain('מעגל');
  });

  it('accepts a chain of three kits', async () => {
    const admin = api(adminJar);
    await admin.put(`/item-kits/${id['עמוק3']}`, { lines: [line('כדור', 1)] }).expect(200);
    await admin.put(`/item-kits/${id['עמוק2']}`, { lines: [line('עמוק3', 1)] }).expect(200);
    await admin.put(`/item-kits/${id['עמוק1']}`, { lines: [line('עמוק2', 1)] }).expect(200);
  });

  it('refuses a kit at the bottom of that chain that would make it four deep', async () => {
    const res = await api(adminJar).put(`/item-kits/${id['כדור']}`, { lines: [line('נרתיק', 1)] }).expect(400);
    expect(res.body.message).toContain('עמוקות');
  });
});

describe('what a kit pre-fills', () => {
  const soldier = '00000000-0000-4000-8000-000000000001';
  const bundle = async (name: string, alwaysOnly: boolean) => {
    const res = await api(adminJar)
      .get(`/issue-bundle?itemName=${encodeURIComponent(PREFIX + name)}&soldierId=${soldier}&alwaysOnly=${alwaysOnly}`)
      .expect(200);
    return Object.fromEntries(res.body.map((l: { item: { name: string }; quantity: number }) => [l.item.name, l.quantity]));
  };

  it('expands nested kits, multiplies quantities and merges repeated items', async () => {
    const admin = api(adminJar);
    await admin.put(`/item-kits/${id['נרתיק']}`, { lines: [line('מחסנית', 3)] }).expect(200);
    await admin.put(`/item-kits/${id['רובה']}`, { lines: [line('נרתיק', 2), line('מחסנית', 1), line('אופטיקה', 1, 'IF_ALLOCATED')] }).expect(200);
    expect(await bundle('רובה', false)).toEqual({ [PREFIX + 'נרתיק']: 2, [PREFIX + 'מחסנית']: 7 });
  });

  it('leaves an IF_ALLOCATED line out for a soldier who has no allocation for it', async () => {
    expect(await bundle('רובה', false)).not.toHaveProperty(PREFIX + 'אופטיקה');
  });

  it('returns the same always-lines in always-only mode', async () => {
    expect(await bundle('רובה', true)).toEqual({ [PREFIX + 'נרתיק']: 2, [PREFIX + 'מחסנית']: 7 });
  });

  it('returns nothing for an item with no kit, and for an unknown name', async () => {
    expect(await bundle('אופטיקה', false)).toEqual({});
    const res = await api(adminJar).get(`/issue-bundle?itemName=${encodeURIComponent('לא קיים')}&soldierId=${soldier}`).expect(200);
    expect(res.body).toEqual([]);
  });

  it('serves item-pairings from the same kit', async () => {
    const res = await api(adminJar).get(`/item-pairings?itemName=${encodeURIComponent(PREFIX + 'נרתיק')}`).expect(200);
    expect(res.body.map((l: { item: { name: string } }) => l.item.name)).toEqual([PREFIX + 'מחסנית']);
  });
});

describe('history', () => {
  it('records who saved what, before and after', async () => {
    const res = await api(adminJar).get(`/item-kits/${id['רובה']}/history`).expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const latest = res.body[0];
    expect(latest.actorName).toBe('מנהל ערכות');
    expect(latest.after.map((l: { itemName: string }) => l.itemName)).toEqual([PREFIX + 'נרתיק', PREFIX + 'מחסנית', PREFIX + 'אופטיקה']);
    expect(latest.before.map((l: { itemName: string }) => l.itemName)).toEqual([PREFIX + 'מחסנית', PREFIX + 'אופטיקה']);
  });

  it('writes no row when a save changes nothing', async () => {
    const admin = api(adminJar);
    const before = (await admin.get(`/item-kits/${id['רובה']}/history`).expect(200)).body.length;
    await admin.put(`/item-kits/${id['רובה']}`, { lines: [line('נרתיק', 2), line('מחסנית', 1), line('אופטיקה', 1, 'IF_ALLOCATED')] }).expect(200);
    expect((await admin.get(`/item-kits/${id['רובה']}/history`).expect(200)).body).toHaveLength(before);
  });

  it('cannot be edited or deleted, even directly in the database', async () => {
    const row = await prisma.itemKitChange.findFirstOrThrow({ where: { baseItemId: id['רובה'] } });
    await expect(prisma.itemKitChange.update({ where: { id: row.id }, data: { actorName: 'x' } })).rejects.toThrow();
    await expect(prisma.itemKitChange.delete({ where: { id: row.id } })).rejects.toThrow();
  });
});

describe('an item that is in a kit', () => {
  it('cannot be deleted, and the message names the kits', async () => {
    const res = await api(adminJar).del(`/items/${id['מחסנית']}`).expect(400);
    expect(res.body.message).toContain(PREFIX + 'רובה');
    expect(res.body.message).toContain(PREFIX + 'נרתיק');
  });

  it('cannot be deactivated, and the message names the kits', async () => {
    const res = await api(adminJar).patch(`/items/${id['מחסנית']}`, { isActive: false }).expect(400);
    expect(res.body.message).toContain(PREFIX + 'רובה');
  });

  it('can be deactivated once it is out of every kit', async () => {
    const admin = api(adminJar);
    await admin.put(`/item-kits/${id['נרתיק']}`, { lines: [] }).expect(200);
    await admin.put(`/item-kits/${id['רובה']}`, { lines: [line('נרתיק', 2)] }).expect(200);
    await admin.patch(`/items/${id['מחסנית']}`, { isActive: false }).expect(200);
  });

  it('deleting a base item takes its kit along and keeps the history', async () => {
    const admin = api(adminJar);
    await admin.put(`/item-kits/${id['עמוק1']}`, { lines: [] }).expect(200);
    await admin.put(`/item-kits/${id['עמוק2']}`, { lines: [] }).expect(200);
    await admin.put(`/item-kits/${id['עמוק3']}`, { lines: [line('כדור', 1)] }).expect(200);
    await admin.del(`/items/${id['עמוק3']}`).expect(200);
    const rows = await prisma.itemKitChange.findMany({ where: { baseItemId: id['עמוק3'] }, orderBy: { at: 'desc' } });
    expect(rows[0]?.after).toEqual([]);
    expect(rows[0]?.baseItemName).toBe(PREFIX + 'עמוק3');
  });
});
