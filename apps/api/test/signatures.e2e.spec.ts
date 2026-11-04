/**
 * The core flow: ניפוק / זיכוי and the audit log.
 *
 * These cover the guarantees the whole app rests on: a serial can be held by
 * only one soldier, the app refuses a serialized item without a serial, and
 * every action writes exactly one audit row naming who performed it.
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

const STAFF = { username: 'e2e_sig_staff', password: 'e2e-sig-password-123' };
const VIEWER = { username: 'e2e_sig_viewer', password: 'e2e-sig-viewer-123' };

const SERIALIZED_ITEM = 'E2E רובה';
const BULK_ITEM = 'E2E כוונת';

let app: INestApplication;
let prisma: PrismaService;
let staffJar: string;
let viewerJar: string;

let itemSerializedId: string;
let itemBulkId: string;
let soldierAId: string;
let soldierBId: string;

function jarFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function login(creds: { username: string; password: string }): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(creds).expect(200);
  return jarFrom(res);
}

/** Removes every row this suite creates, in FK-safe order. */
async function cleanup(): Promise<void> {
  const items = await prisma.item.findMany({
    where: { name: { in: [SERIALIZED_ITEM, BULK_ITEM] } },
    select: { id: true },
  });
  const itemIds = items.map((i) => i.id);
  const soldiers = await prisma.soldier.findMany({
    where: { lastName: 'E2E-בדיקה' },
    select: { id: true },
  });
  const soldierIds = soldiers.map((s) => s.id);

  // Movements are append-only, so they are removed with a raw delete that
  // bypasses the guard trigger — test data only, never used by the app.
  if (soldierIds.length || itemIds.length) {
    await prisma.$executeRaw`ALTER TABLE movements DISABLE TRIGGER USER`;
    await prisma.movement.deleteMany({
      where: { OR: [{ soldierId: { in: soldierIds } }, { itemId: { in: itemIds } }] },
    });
    await prisma.$executeRaw`ALTER TABLE movements ENABLE TRIGGER USER`;
  }
  await prisma.signature.deleteMany({
    where: { OR: [{ soldierId: { in: soldierIds } }, { itemId: { in: itemIds } }] },
  });
  await prisma.itemInstance.deleteMany({ where: { itemId: { in: itemIds } } });
  await prisma.soldier.deleteMany({ where: { id: { in: soldierIds } } });
  await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
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

  await prisma.user.deleteMany({ where: { username: { in: [STAFF.username, VIEWER.username] } } });
  await prisma.user.create({
    data: {
      username: STAFF.username,
      displayName: 'אפי הבודק',
      role: 'logistics',
      passwordHash: await bcrypt.hash(STAFF.password, 12),
    },
  });
  await prisma.user.create({
    data: {
      username: VIEWER.username,
      displayName: 'צופה',
      role: 'viewer',
      passwordHash: await bcrypt.hash(VIEWER.password, 12),
    },
  });

  staffJar = await login(STAFF);
  viewerJar = await login(VIEWER);
});

afterAll(async () => {
  await cleanup();
  await prisma?.user.deleteMany({
    where: { username: { in: [STAFF.username, VIEWER.username] } },
  });
  await app?.close();
});

beforeEach(async () => {
  await cleanup();

  const serialized = await prisma.item.create({
    data: { name: SERIALIZED_ITEM, category: 'WEAPON', isSerialized: true, authorizedQty: 10 },
  });
  const bulk = await prisma.item.create({
    data: { name: BULK_ITEM, category: 'OPTICS', isSerialized: false, authorizedQty: 50 },
  });
  itemSerializedId = serialized.id;
  itemBulkId = bulk.id;

  await prisma.itemInstance.createMany({
    data: [
      { itemId: serialized.id, serial: 'E2E-0001' },
      { itemId: serialized.id, serial: 'E2E-0002' },
      { itemId: serialized.id, serial: 'E2E-FAULTY', status: 'FAULTY' },
    ],
  });

  const a = await prisma.soldier.create({
    data: { firstName: 'חייל-א', lastName: 'E2E-בדיקה', company: 'A' },
  });
  const b = await prisma.soldier.create({
    data: { firstName: 'חייל-ב', lastName: 'E2E-בדיקה', company: 'B' },
  });
  soldierAId = a.id;
  soldierBId = b.id;
});

describe('ניפוק — serialized items', () => {
  it('signs an item and records exactly one audit row naming the performer', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemSerializedId, serial: 'E2E-0001', receiptNo: '42' })
      .expect(201);

    expect(res.body.returnedAt).toBeNull();

    const movements = await prisma.movement.findMany({ where: { soldierId: soldierAId } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      action: 'ISSUE',
      serialSnapshot: 'E2E-0001',
      quantity: 1,
      receiptNo: '42',
      performedByNameSnapshot: 'אפי הבודק',
      soldierNameSnapshot: 'חייל-א E2E-בדיקה',
      itemNameSnapshot: SERIALIZED_ITEM,
      companySnapshot: 'A',
    });
  });

  it('refuses a serialized item with no serial', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemSerializedId })
      .expect(400);
    expect(res.body.message).toContain('מסד');

    // Nothing was written, so no audit row either.
    expect(await prisma.movement.count({ where: { soldierId: soldierAId } })).toBe(0);
  });

  it('refuses to sign one serial to a second soldier', async () => {
    await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemSerializedId, serial: 'E2E-0001' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierBId, itemId: itemSerializedId, serial: 'E2E-0001' })
      .expect(409);
    expect(res.body.message).toContain('חייל-א');
  });

  it('refuses a faulty instance', async () => {
    await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemSerializedId, serial: 'E2E-FAULTY' })
      .expect(400);
  });

  it('refuses an unknown serial', async () => {
    await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemSerializedId, serial: 'NOPE-9999' })
      .expect(404);
  });

  it('frees the serial again after it is returned', async () => {
    const issued = await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemSerializedId, serial: 'E2E-0001' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/signatures/${issued.body.id}/return`)
      .set('Cookie', staffJar)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierBId, itemId: itemSerializedId, serial: 'E2E-0001' })
      .expect(201);
  });
});

describe('ניפוק — non-serialized items', () => {
  it('rejects a serial on an item that does not take one', async () => {
    await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemBulkId, serial: 'SHOULD-NOT-BE-HERE' })
      .expect(400);
  });

  it('accumulates quantity on one open signature', async () => {
    await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemBulkId, quantity: 2 })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemBulkId, quantity: 3 })
      .expect(201);

    const open = await prisma.signature.findMany({
      where: { soldierId: soldierAId, itemId: itemBulkId, returnedAt: null },
    });
    expect(open).toHaveLength(1);
    expect(open[0]?.quantity).toBe(5);

    // Both issues are logged separately even though they share a signature.
    const movements = await prisma.movement.findMany({
      where: { soldierId: soldierAId, action: 'ISSUE' },
    });
    expect(movements).toHaveLength(2);
    expect(movements.map((m) => m.quantity).sort()).toEqual([2, 3]);
  });

  it('supports a partial return that leaves the signature open', async () => {
    const issued = await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemBulkId, quantity: 5 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/signatures/${issued.body.id}/return`)
      .set('Cookie', staffJar)
      .send({ quantity: 2 })
      .expect(201);

    const after = await prisma.signature.findUnique({ where: { id: issued.body.id } });
    expect(after?.quantity).toBe(3);
    expect(after?.returnedAt).toBeNull();
  });

  it('refuses to return more than is signed', async () => {
    const issued = await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemBulkId, quantity: 2 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/signatures/${issued.body.id}/return`)
      .set('Cookie', staffJar)
      .send({ quantity: 99 })
      .expect(400);
  });
});

describe('זיכוי', () => {
  it('records the return and refuses a second one', async () => {
    const issued = await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemSerializedId, serial: 'E2E-0002' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/signatures/${issued.body.id}/return`)
      .set('Cookie', staffJar)
      .send({ notes: 'הוחזר לנשקיה' })
      .expect(201);

    const returned = await prisma.movement.findFirst({
      where: { soldierId: soldierAId, action: 'RETURN' },
    });
    expect(returned).toMatchObject({
      serialSnapshot: 'E2E-0002',
      performedByNameSnapshot: 'אפי הבודק',
      notes: 'הוחזר לנשקיה',
    });

    await request(app.getHttpServer())
      .post(`/api/signatures/${issued.body.id}/return`)
      .set('Cookie', staffJar)
      .send({})
      .expect(400);
  });
});

describe('permissions', () => {
  it('denies a viewer the ability to sign or return', async () => {
    await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', viewerJar)
      .send({ soldierId: soldierAId, itemId: itemSerializedId, serial: 'E2E-0001' })
      .expect(403);
  });

  it('lets a viewer read the signature list and the audit log', async () => {
    await request(app.getHttpServer()).get('/api/signatures').set('Cookie', viewerJar).expect(200);
    await request(app.getHttpServer()).get('/api/movements').set('Cookie', viewerJar).expect(200);
  });
});

describe('דוח תנועות', () => {
  it('reports each action with who performed it', async () => {
    const issued = await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemSerializedId, serial: 'E2E-0001', receiptNo: '20' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/signatures/${issued.body.id}/return`)
      .set('Cookie', staffJar)
      .send({})
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/movements')
      .query({ soldierId: soldierAId })
      .set('Cookie', staffJar)
      .expect(200);

    expect(res.body.total).toBe(2);
    const actions = res.body.rows.map((r: { action: string }) => r.action);
    expect(actions).toContain('ISSUE');
    expect(actions).toContain('RETURN');

    // The API returns enum keys; the Hebrew labels live in the frontend.
    const issue = res.body.rows.find((r: { action: string }) => r.action === 'ISSUE');
    expect(issue).toMatchObject({
      soldierName: 'חייל-א E2E-בדיקה',
      company: 'A',
      itemName: SERIALIZED_ITEM,
      serial: 'E2E-0001',
      receiptNo: '20',
      performedBy: 'אפי הבודק',
    });
  });

  it('filters by action', async () => {
    await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemSerializedId, serial: 'E2E-0001' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/movements')
      .query({ soldierId: soldierAId, action: 'RETURN' })
      .set('Cookie', staffJar)
      .expect(200);
    expect(res.body.total).toBe(0);
  });

  it('keeps the log readable after the soldier is renamed', async () => {
    await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemSerializedId, serial: 'E2E-0001' })
      .expect(201);

    await prisma.soldier.update({ where: { id: soldierAId }, data: { firstName: 'שם-חדש' } });

    const res = await request(app.getHttpServer())
      .get('/api/movements')
      .query({ soldierId: soldierAId })
      .set('Cookie', staffJar)
      .expect(200);

    // The snapshot preserves who it was at the time of the action.
    expect(res.body.rows[0].soldierName).toBe('חייל-א E2E-בדיקה');
  });
});

describe('serial backfill', () => {
  it('completes a serial missing from the import and clears the flag', async () => {
    // Mimic an imported row: serialized item, no instance, flagged.
    const flagged = await prisma.signature.create({
      data: {
        soldierId: soldierAId,
        itemId: itemSerializedId,
        quantity: 1,
        needsAttention: true,
        signedByUserId: (await prisma.user.findUniqueOrThrow({ where: { username: STAFF.username } })).id,
      },
    });
    await prisma.importIssue.create({
      data: {
        kind: 'MISSING_SERIAL',
        rowNumber: 99,
        rawRow: 'test row',
        detail: 'missing serial',
        signatureId: flagged.id,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/signatures/${flagged.id}/backfill-serial`)
      .set('Cookie', staffJar)
      .send({ serial: 'E2E-0002' })
      .expect(201);

    const after = await prisma.signature.findUniqueOrThrow({ where: { id: flagged.id } });
    expect(after.needsAttention).toBe(false);
    expect(after.itemInstanceId).not.toBeNull();

    const issue = await prisma.importIssue.findFirstOrThrow({
      where: { signatureId: flagged.id },
    });
    expect(issue.resolvedAt).not.toBeNull();

    await prisma.importIssue.deleteMany({ where: { signatureId: flagged.id } });
  });
});
