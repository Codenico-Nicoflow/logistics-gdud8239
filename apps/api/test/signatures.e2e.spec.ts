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

/** Real ACTIVE periods already in this dev DB when the suite started —
 *  closed for the duration of the run (so the מחויל gate's `findFirst`
 *  deterministically finds this suite's own period) and reopened once in
 *  `afterAll`, never left CLOSED behind the suite. */
let reopenPeriodIds: string[] = [];

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
  await prisma.servicePeriod.deleteMany({ where: { name: 'E2E תקופה' } });
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
  if (reopenPeriodIds.length) {
    await prisma.servicePeriod.updateMany({
      where: { id: { in: reopenPeriodIds } },
      data: { status: 'ACTIVE' },
    });
  }
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

  // A weapon can only be issued to a soldier שלישות has marked מחויל for the
  // active תקופת שרות — both test soldiers need that to exercise the
  // WEAPON-category flows below. `findFirst({ status: 'ACTIVE' })` has no
  // guaranteed order, so a real ACTIVE period already in this dev DB (this
  // suite runs against it, not a throwaway one) could get picked instead of
  // this test's own. Closed out here and restored in `afterAll` — real
  // periods this suite didn't create are never left CLOSED behind it.
  const otherActive = await prisma.servicePeriod.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  reopenPeriodIds.push(...otherActive.map((p) => p.id));
  await prisma.servicePeriod.updateMany({
    where: { id: { in: otherActive.map((p) => p.id) } },
    data: { status: 'CLOSED' },
  });
  const period = await prisma.servicePeriod.create({
    data: {
      name: 'E2E תקופה',
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86400000),
      status: 'ACTIVE',
    },
  });
  await prisma.soldierEnlistment.createMany({
    data: [
      { soldierId: soldierAId, servicePeriodId: period.id },
      { soldierId: soldierBId, servicePeriodId: period.id },
    ],
  });
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

  it('records a serial the register has not seen yet', async () => {
    // The armory's instance list is incomplete and is being built from the
    // signatures as they are entered, so an unknown מסד is created rather than
    // rejected — refusing it would block real work to protect a register that
    // does not yet exist.
    const res = await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemSerializedId, serial: 'E2E-BRAND-NEW' })
      .expect(201);

    const signature = await prisma.signature.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { itemInstance: true },
    });
    expect(signature.itemInstance?.serial).toBe('E2E-BRAND-NEW');

    // And the guarantee that matters still holds the moment it is known.
    await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierBId, itemId: itemSerializedId, serial: 'E2E-BRAND-NEW' })
      .expect(409);
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

describe('adding a soldier from within ניפוק', () => {
  /**
   * A soldier who has never signed for anything is not in the system, and
   * ניפוק is where that is discovered. Two different checks guard it: a מ.א.
   * is unique and enforced, while a repeated name is only worth a warning
   * because two soldiers in one company really can share one.
   */
  const NEW_PN = '7777701';

  async function removeTestSoldier(): Promise<void> {
    await prisma.soldier.deleteMany({
      where: { personalNumber: NEW_PN, signatures: { none: {} }, movements: { none: {} } },
    });
  }

  beforeEach(removeTestSoldier);
  afterAll(removeTestSoldier);

  it('refuses a מ.א. that belongs to someone else', async () => {
    await request(app.getHttpServer())
      .post('/api/soldiers')
      .set('Cookie', staffJar)
      .send({ firstName: 'ראשון', lastName: 'E2E-מ"א', company: 'A', personalNumber: NEW_PN })
      .expect(201);

    // The same מ.א. identifies one person, so a second claim on it is an error
    // rather than a warning.
    const clash = await request(app.getHttpServer())
      .post('/api/soldiers')
      .set('Cookie', staffJar)
      .send({ firstName: 'שני', lastName: 'אחר', company: 'B', personalNumber: NEW_PN })
      .expect(409);
    expect(clash.body.message).toContain(NEW_PN);

    await prisma.soldier.deleteMany({ where: { personalNumber: NEW_PN } });
  });

  it('warns about a repeated name in the same company without blocking it', async () => {
    const existing = await prisma.soldier.findFirstOrThrow({ where: { isActive: true } });

    const found = await request(app.getHttpServer())
      .post('/api/soldiers/check-duplicates')
      .set('Cookie', staffJar)
      .send({
        firstName: existing.firstName,
        lastName: existing.lastName,
        company: existing.company,
      })
      .expect(201);

    // Reported so the operator can compare מ.א. and decide — not refused.
    expect(found.body.length).toBeGreaterThan(0);
    expect(found.body[0].id).toBeTruthy();
  });

  it('does not warn when the same name is in a different company', async () => {
    const existing = await prisma.soldier.findFirstOrThrow({
      where: { isActive: true, company: 'A' },
    });

    const found = await request(app.getHttpServer())
      .post('/api/soldiers/check-duplicates')
      .set('Cookie', staffJar)
      .send({ firstName: existing.firstName, lastName: existing.lastName, company: 'SUPPORT' })
      .expect(201);

    expect(found.body.every((s: { id: string }) => s.id !== existing.id)).toBe(true);
  });
});

describe('ניפוק — non-serialized items', () => {
  it('accepts an optional serial and records it as an instance', async () => {
    // An item not flagged `isSerialized` may still carry a מסד: staff do track
    // serials on items the catalog calls bulk, and refusing them pushed the
    // number into a free-text note where nothing could search it.
    const res = await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierAId, itemId: itemBulkId, serial: 'E2E-BULK-SERIAL' })
      .expect(201);

    const signature = await prisma.signature.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { itemInstance: true },
    });
    expect(signature.itemInstance?.serial).toBe('E2E-BULK-SERIAL');
    // An instance is one physical unit, so the quantity is 1 regardless.
    expect(signature.quantity).toBe(1);

    // And it is now held: a second soldier cannot be signed on the same מסד.
    await request(app.getHttpServer())
      .post('/api/signatures/issue')
      .set('Cookie', staffJar)
      .send({ soldierId: soldierBId, itemId: itemBulkId, serial: 'E2E-BULK-SERIAL' })
      .expect(409);

    // Cleared so the quantity-accumulation case below starts from nothing.
    await prisma.signature.delete({ where: { id: signature.id } });
    await prisma.itemInstance.delete({ where: { id: signature.itemInstanceId as string } });
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
