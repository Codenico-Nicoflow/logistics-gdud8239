/**
 * Multi-tenant tenancy columns: what a battalion owns, and what it may share with another. Every case runs
 * inside a transaction that is rolled back, because `issue_forms` is append-only and a test row in it could
 * never be cleaned up.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { takeFormNo } from '../src/issue-forms/form-no';

const ROLLBACK = 'rollback-on-purpose';

let prisma: PrismaService;

beforeAll(async () => {
  prisma = new PrismaService();
  await prisma.onModuleInit();
});

afterAll(async () => {
  await prisma.onModuleDestroy();
});

/** Runs `body` against a rolled-back transaction and hands back whatever it returned. */
async function inRollback<T>(body: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let result: T | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      result = await body(tx);
      throw new Error(ROLLBACK);
    });
  } catch (e) {
    if (!(e instanceof Error) || e.message !== ROLLBACK) throw e;
  }
  return result as T;
}

/** A second battalion with one company of its own, "X". */
async function otherBattalion(tx: Prisma.TransactionClient) {
  const b = await tx.battalion.create({ data: { name: 'E2E גדוד', number: `E2E-${Date.now()}` } });
  await tx.company.create({ data: { battalionId: b.id, code: 'X', name: 'פלוגה X' } });
  return b;
}

const soldierIn = (company: string, battalionId?: string, personalNumber?: string): Prisma.SoldierUncheckedCreateInput => ({
  firstName: 'א',
  lastName: 'ב',
  company,
  ...(personalNumber ? { personalNumber } : {}),
  ...(battalionId ? { battalionId } : {}),
});

describe('battalion foundation', () => {
  it('has 8239 as the battalion existing data was moved into, with its five companies', async () => {
    const b = await prisma.battalion.findUniqueOrThrow({ where: { number: '8239' }, include: { companies: true } });
    expect(b.name).toBe('גדוד 8239');
    expect(b.companies.map((c) => c.code).sort()).toEqual(['A', 'B', 'C', 'HQ', 'SUPPORT']);
  });

  it('fills the tenant in from the database when a create does not say', async () => {
    const [soldier, home] = await inRollback(async (tx) => {
      const s = await tx.soldier.create({ data: soldierIn('A') });
      const h = await tx.battalion.findUniqueOrThrow({ where: { number: '8239' } });
      return [s, h] as const;
    });
    expect(soldier.battalionId).toBe(home.id);
  });

  it('lets the request setting pick the tenant instead of the fallback', async () => {
    const picked = await inRollback(async (tx) => {
      const b = await otherBattalion(tx);
      await tx.$executeRaw`SELECT set_config('app.battalion_id', ${b.id}, true)`;
      const s = await tx.soldier.create({ data: soldierIn('X') });
      return { soldierBattalion: s.battalionId, expected: b.id };
    });
    expect(picked.soldierBattalion).toBe(picked.expected);
  });
});

describe('uniqueness is per battalion', () => {
  it('allows the same personal number, item name and setting key in two battalions', async () => {
    await inRollback(async (tx) => {
      const b = await otherBattalion(tx);
      await tx.soldier.create({ data: soldierIn('A', undefined, '7000001') });
      await tx.soldier.create({ data: soldierIn('X', b.id, '7000001') });
      await tx.item.create({ data: { name: 'E2E-פריט', category: 'GEAR' } });
      await tx.item.create({ data: { name: 'E2E-פריט', category: 'GEAR', battalionId: b.id } });
      await tx.teamMember.create({ data: { nickname: 'E2E-כינוי' } });
      await tx.teamMember.create({ data: { nickname: 'E2E-כינוי', battalionId: b.id } });
      await tx.appSetting.create({ data: { key: 'e2e.key', value: 'a' } });
      await tx.appSetting.create({ data: { key: 'e2e.key', value: 'b', battalionId: b.id } });
    });
  });

  it('still refuses the same personal number, item name or setting key twice in one battalion', async () => {
    await expect(
      inRollback(async (tx) => {
        await tx.soldier.create({ data: soldierIn('A', undefined, '7000002') });
        await tx.soldier.create({ data: soldierIn('B', undefined, '7000002') });
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await expect(
      inRollback(async (tx) => {
        await tx.item.create({ data: { name: 'E2E-כפול', category: 'GEAR' } });
        await tx.item.create({ data: { name: 'E2E-כפול', category: 'GEAR' } });
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await expect(
      inRollback(async (tx) => {
        await tx.appSetting.create({ data: { key: 'e2e.dup', value: 'a' } });
        await tx.appSetting.create({ data: { key: 'e2e.dup', value: 'b' } });
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('companies belong to a battalion', () => {
  it('lets two battalions each have a company with the same code', async () => {
    await inRollback(async (tx) => {
      const b = await otherBattalion(tx);
      await tx.company.create({ data: { battalionId: b.id, code: 'A', name: 'א' } });
    });
  });

  it("refuses a soldier whose company code is another battalion's, or does not exist", async () => {
    // "X" exists only in the other battalion, so the default (8239) soldier cannot use it.
    await expect(
      inRollback(async (tx) => {
        await otherBattalion(tx);
        await tx.soldier.create({ data: soldierIn('X') });
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    await expect(inRollback((tx) => tx.soldier.create({ data: soldierIn('NOPE') }))).rejects.toMatchObject({ code: 'P2003' });
  });

  it('refuses to delete a company a soldier still uses, and follows a code rename through', async () => {
    await expect(
      inRollback(async (tx) => {
        await tx.soldier.create({ data: soldierIn('A') });
        await tx.company.deleteMany({ where: { code: 'A' } });
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    const renamed = await inRollback(async (tx) => {
      const s = await tx.soldier.create({ data: soldierIn('A') });
      await tx.company.updateMany({ where: { code: 'A' }, data: { code: 'A2' } });
      return tx.soldier.findUniqueOrThrow({ where: { id: s.id }, select: { company: true } });
    });
    expect(renamed.company).toBe('A2');
  });
});

describe('1008 form numbers', () => {
  const formData = (formNo: number, soldierId: string, userId: string, battalionId?: string): Prisma.IssueFormUncheckedCreateInput => ({
    formNo,
    soldierId,
    soldierNameSnapshot: 'E2E',
    companySnapshot: 'A',
    signatureImage: 'data:image/png;base64,iVBORw0KGgo=',
    issuedByUserId: userId,
    issuedByNameSnapshot: 'E2E',
    ...(battalionId ? { battalionId } : {}),
  });

  it('come one after another from the counter', async () => {
    const [first, second] = await inRollback(async (tx) => [await takeFormNo(tx), await takeFormNo(tx)] as const);
    expect(second).toBe(first + 1);
  });

  it('never hand out a number that is already on file, even if the counter fell behind', async () => {
    const [ahead, next] = await inRollback(async (tx) => {
      const user = await tx.user.create({ data: { username: `e2e-fn-${Date.now()}`, displayName: 'E2E', role: 'admin' } });
      const soldier = await tx.soldier.create({ data: soldierIn('A') });
      const ahead = (await takeFormNo(tx)) + 10;
      await tx.issueForm.create({ data: formData(ahead, soldier.id, user.id) });
      return [ahead, await takeFormNo(tx)] as const;
    });
    expect(next).toBe(ahead + 1);
  });

  it('let two battalions both have the same number, but not one battalion twice', async () => {
    await inRollback(async (tx) => {
      const b = await otherBattalion(tx);
      const user = await tx.user.create({ data: { username: `e2e-fn2-${Date.now()}`, displayName: 'E2E', role: 'admin' } });
      const s1 = await tx.soldier.create({ data: soldierIn('A') });
      const s2 = await tx.soldier.create({ data: soldierIn('X', b.id) });
      await tx.issueForm.create({ data: formData(900_000_001, s1.id, user.id) });
      await tx.issueForm.create({ data: formData(900_000_001, s2.id, user.id, b.id) });
    });

    await expect(
      inRollback(async (tx) => {
        const user = await tx.user.create({ data: { username: `e2e-fn3-${Date.now()}`, displayName: 'E2E', role: 'admin' } });
        const s = await tx.soldier.create({ data: soldierIn('A') });
        await tx.issueForm.create({ data: formData(900_000_002, s.id, user.id) });
        await tx.issueForm.create({ data: formData(900_000_002, s.id, user.id) });
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('append-only history', () => {
  it('keeps the append-only triggers on every audit table', async () => {
    const rows = await prisma.$queryRaw<{ tgrelid: string }[]>`
      SELECT tgrelid::regclass::text AS tgrelid FROM pg_trigger WHERE NOT tgisinternal`;
    const guarded = new Set(rows.map((r) => r.tgrelid));
    for (const table of ['movements', 'issue_forms', 'issue_form_amendments', 'item_kit_changes', 'item_replacements']) {
      expect(guarded.has(table), `${table} lost its append-only trigger`).toBe(true);
    }
  });
});
