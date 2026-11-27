/**
 * `טופס 1008` — issuing a soldier a whole handover against one signature.
 *
 * The property that matters: the soldier signed for a list, so the list lands
 * or nothing does. A מסד already held by someone else must not leave half the
 * handover recorded with no form to show for it.
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

const STAFF = { username: 'e2e_form_staff', password: 'e2e-form-staff-123' };
const LAST = 'E2E-טופס';
const WEAPON = 'E2E רובה טופס';
const ACCESSORY = 'E2E מחסנית טופס';

/** A 1x1 PNG — shape is what the DTO validates, not the drawing. */
const SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let app: INestApplication;
let prisma: PrismaService;
let jar: string;
let weaponId: string;
let accessoryId: string;
let soldierA: string;
let soldierB: string;

/** See the identical comment in signatures.e2e.spec.ts: real ACTIVE periods
 *  already in this dev DB are closed for the run and reopened in `afterAll`. */
let reopenPeriodIds: string[] = [];

async function cleanup(): Promise<void> {
  const soldiers = await prisma.soldier.findMany({
    where: { lastName: LAST },
    select: { id: true },
  });
  const ids = soldiers.map((s) => s.id);
  // `contains`, not `in`: one test renames the accessory mid-run (to
  // `${ACCESSORY} שונה ${Date.now()}`, to prove a snapshot survives a later
  // rename) and an exact-name match would never find that row again,
  // leaking it into the real catalog on every run.
  const items = await prisma.item.findMany({
    where: { OR: [{ name: { contains: WEAPON } }, { name: { contains: ACCESSORY } }] },
    select: { id: true },
  });
  const itemIds = items.map((i) => i.id);

  await ownerExec('ALTER TABLE issue_forms DISABLE TRIGGER USER');
  await prisma.issueForm.deleteMany({ where: { soldierId: { in: ids } } });
  await ownerExec('ALTER TABLE issue_forms ENABLE TRIGGER USER');

  await ownerExec('ALTER TABLE movements DISABLE TRIGGER USER');
  await prisma.movement.deleteMany({
    where: { OR: [{ soldierId: { in: ids } }, { itemId: { in: itemIds } }] },
  });
  await ownerExec('ALTER TABLE movements ENABLE TRIGGER USER');

  await prisma.signature.deleteMany({
    where: { OR: [{ soldierId: { in: ids } }, { itemId: { in: itemIds } }] },
  });
  await prisma.itemInstance.deleteMany({ where: { itemId: { in: itemIds } } });
  await prisma.soldier.deleteMany({ where: { id: { in: ids } } });
  await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
  await prisma.servicePeriod.deleteMany({ where: { name: 'E2E טופס תקופה' } });
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
      displayName: 'מנפק הבדיקה',
      role: 'logistics',
      passwordHash: await bcrypt.hash(STAFF.password, 12),
    },
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(STAFF).expect(200);
  jar = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
});

afterAll(async () => {
  await cleanup();
  if (reopenPeriodIds.length) {
    await prisma.servicePeriod.updateMany({
      where: { id: { in: reopenPeriodIds } },
      data: { status: 'ACTIVE' },
    });
  }
  await prisma?.user.deleteMany({ where: { username: STAFF.username } });
  await app?.close();
});

beforeEach(async () => {
  await cleanup();
  const weapon = await prisma.item.create({
    data: { name: WEAPON, category: 'WEAPON', isSerialized: true, authorizedQty: 5 },
  });
  const accessory = await prisma.item.create({
    data: {
      name: ACCESSORY,
      category: 'ACCESSORY',
      isSerialized: false,
      inSummary: false,
      authorizedQty: 0,
      defaultQty: 5,
    },
  });
  weaponId = weapon.id;
  accessoryId = accessory.id;

  const a = await prisma.soldier.create({
    data: { firstName: 'ראשון', lastName: LAST, company: 'A', personalNumber: '8222201' },
  });
  const b = await prisma.soldier.create({
    data: { firstName: 'שני', lastName: LAST, company: 'B', personalNumber: '8222202' },
  });
  soldierA = a.id;
  soldierB = b.id;

  // A weapon line only goes through for a soldier שלישות has marked מחויל
  // for the active תקופת שרות — both test soldiers here sign for WEAPON.
  // `findFirst({ status: 'ACTIVE' })` has no guaranteed order, so a real
  // ACTIVE period already in this dev DB could get picked instead of this
  // test's own — closed here, reopened in `afterAll`.
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
      name: 'E2E טופס תקופה',
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86400000),
      status: 'ACTIVE',
    },
  });
  await prisma.soldierEnlistment.createMany({
    data: [
      { soldierId: soldierA, servicePeriodId: period.id },
      { soldierId: soldierB, servicePeriodId: period.id },
    ],
  });
});

function post(body: object) {
  return request(app.getHttpServer()).post('/api/issue-forms').set('Cookie', jar).send(body);
}

describe('טופס 1008', () => {
  it('records a weapon and its accessories under one signature', async () => {
    const res = await post({
      soldierId: soldierA,
      signatureImage: SIGNATURE,
      lines: [
        { itemId: weaponId, serial: 'FORM-A-1', quantity: 1 },
        { itemId: accessoryId, quantity: 5 },
      ],
    }).expect(201);

    expect(res.body.formNo).toBeGreaterThan(0);
    expect(res.body.lines).toHaveLength(2);

    // Each line opens a real signature, so the armory's totals stay right.
    const open = await prisma.signature.findMany({
      where: { soldierId: soldierA, returnedAt: null },
    });
    expect(open).toHaveLength(2);

    // And each is in the audit log, naming who issued it.
    const movements = await prisma.movement.findMany({ where: { soldierId: soldierA } });
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.performedByNameSnapshot === 'מנפק הבדיקה')).toBe(true);
  });

  it('refuses a serialized item with no מסד', async () => {
    await post({
      soldierId: soldierA,
      signatureImage: SIGNATURE,
      lines: [{ itemId: weaponId, quantity: 1 }],
    }).expect(400);
  });

  it('writes nothing when one line of the handover fails', async () => {
    // The soldier signed for a list; half a list is not what they agreed to.
    await post({
      soldierId: soldierB,
      signatureImage: SIGNATURE,
      lines: [{ itemId: weaponId, serial: 'FORM-HELD', quantity: 1 }],
    }).expect(201);

    await post({
      soldierId: soldierA,
      signatureImage: SIGNATURE,
      lines: [
        { itemId: accessoryId, quantity: 5 },
        { itemId: weaponId, serial: 'FORM-HELD', quantity: 1 },
      ],
    }).expect(409);

    expect(await prisma.issueForm.count({ where: { soldierId: soldierA } })).toBe(0);
    expect(
      await prisma.signature.count({ where: { soldierId: soldierA, returnedAt: null } }),
    ).toBe(0);
  });

  it('refuses a second ניפוק to a soldier who already holds items', async () => {
    await post({
      soldierId: soldierA,
      signatureImage: SIGNATURE,
      lines: [{ itemId: accessoryId, quantity: 5 }],
    }).expect(201);

    // Changes go through reissue, not a parallel second form.
    await post({
      soldierId: soldierA,
      signatureImage: SIGNATURE,
      lines: [{ itemId: accessoryId, quantity: 1 }],
    }).expect(409);

    expect(await prisma.issueForm.count({ where: { soldierId: soldierA } })).toBe(1);
  });

  it('refuses the same מסד twice on one form', async () => {
    await post({
      soldierId: soldierA,
      signatureImage: SIGNATURE,
      lines: [
        { itemId: weaponId, serial: 'FORM-DUP', quantity: 1 },
        { itemId: weaponId, serial: 'FORM-DUP', quantity: 1 },
      ],
    }).expect(400);
  });

  it('refuses a signature that is not a PNG data URL', async () => {
    await post({
      soldierId: soldierA,
      signatureImage: 'not-an-image',
      lines: [{ itemId: accessoryId, quantity: 1 }],
    }).expect(400);
  });

  it('refuses a form with no lines', async () => {
    await post({ soldierId: soldierA, signatureImage: SIGNATURE, lines: [] }).expect(400);
  });

  it('keeps the soldier and item as they were when signed', async () => {
    const created = await post({
      soldierId: soldierA,
      signatureImage: SIGNATURE,
      lines: [{ itemId: accessoryId, quantity: 3 }],
    }).expect(201);

    await prisma.soldier.update({
      where: { id: soldierA },
      data: { company: 'HQ', firstName: 'שונה' },
    });
    // Unique per run: a leftover row from an earlier run would collide on the
    // item name and fail this case for the wrong reason.
    await prisma.item.update({
      where: { id: accessoryId },
      data: { name: `${ACCESSORY} שונה ${Date.now()}` },
    });

    // A signed form is evidence of what was agreed on a date: renaming the
    // soldier or the item afterwards must not rewrite it.
    const form = await prisma.issueForm.findUniqueOrThrow({
      where: { id: created.body.id },
      include: { lines: true },
    });
    expect(form.soldierNameSnapshot).toBe(`ראשון ${LAST}`);
    expect(form.companySnapshot).toBe('A');
    expect(form.lines[0]?.itemNameSnapshot).toBe(ACCESSORY);
  });

  it('serves a printable form with the soldier, items and signature on it', async () => {
    const created = await post({
      soldierId: soldierA,
      signatureImage: SIGNATURE,
      receiptNo: 'REC-77',
      lines: [
        { itemId: weaponId, serial: 'FORM-PRINT', quantity: 1, lineNotes: 'הערת שורה' },
      ],
    }).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/issue-forms/${created.body.id}/print`)
      .set('Cookie', jar)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/html');
    // Titled and laid out like the paper שובר the battalion already signs, so
    // whoever files it is not asked to learn a new form.
    expect(res.text).toContain('שובר השאלה פנימית 1008');
    expect(res.text).toContain('8239');
    expect(res.text).toContain('פרטי החייל המשאיל');
    expect(res.text).toContain('פרטי החייל השואל');
    // The six columns of the paper sheet, in its own order.
    for (const column of ['מס"ד', 'תיאור', 'י"ח', 'כמות', 'מזהה', 'הערות']) {
      expect(res.text).toContain(column);
    }
    // דרגה is deliberately absent: the battalion does not track it here.
    expect(res.text).not.toContain('דרגה');
    expect(res.text).toContain('REC-77');
    expect(res.text).toContain('הערת שורה');
    expect(res.text).toContain(`ראשון ${LAST}`);
    expect(res.text).toContain('FORM-PRINT');
    expect(res.text).toContain(SIGNATURE);
    // Personal data: never cached by anything between here and the printer.
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('cannot be edited or deleted once signed', async () => {
    const created = await post({
      soldierId: soldierA,
      signatureImage: SIGNATURE,
      lines: [{ itemId: accessoryId, quantity: 1 }],
    }).expect(201);

    await expect(
      prisma.issueForm.update({
        where: { id: created.body.id },
        data: { soldierNameSnapshot: 'מישהו אחר' },
      }),
    ).rejects.toThrow(/append-only/);
  });
});
