/**
 * Multi-tenant step 1a: the shape of the tenancy columns, nothing more. Every case runs inside a
 * transaction that is rolled back, because `issue_forms` is append-only and a test row in it could
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

function otherBattalion(tx: Prisma.TransactionClient) {
  return tx.battalion.create({ data: { name: 'E2E גדוד', number: `E2E-${Date.now()}` } });
}

describe('battalion foundation', () => {
  it('has 8239 as the battalion existing data was moved into', async () => {
    const b = await prisma.battalion.findUnique({ where: { number: '8239' } });
    expect(b?.name).toBe('גדוד 8239');
  });

  it('fills the tenant in from the database when a create does not say', async () => {
    const [soldier, def] = await inRollback(async (tx) => {
      const s = await tx.soldier.create({ data: { firstName: 'א', lastName: 'ב', company: 'A' } });
      const home = await tx.battalion.findUniqueOrThrow({ where: { number: '8239' } });
      return [s, home] as const;
    });
    expect(soldier.battalionId).toBe(def.id);
  });

  it('lets the request setting pick the tenant instead of the fallback', async () => {
    const picked = await inRollback(async (tx) => {
      const b = await otherBattalion(tx);
      await tx.$executeRaw`SELECT set_config('app.battalion_id', ${b.id}, true)`;
      const s = await tx.soldier.create({ data: { firstName: 'א', lastName: 'ב', company: 'A' } });
      return { soldierBattalion: s.battalionId, expected: b.id };
    });
    expect(picked.soldierBattalion).toBe(picked.expected);
  });

  it('has every per-battalion unique index ready, beside the old ones', async () => {
    // The old single-column keys stay until the contract migration (the previous app version is still
    // serving during a deploy and depends on them); the per-battalion ones are added now so that
    // migration is only a drop. Cross-battalion duplicates become possible then, and are tested there.
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%battalion_id%key'`;
    const have = new Set(rows.map((r) => r.indexname));
    for (const name of [
      'soldiers_battalion_id_personal_number_key',
      'items_battalion_id_name_key',
      'team_members_battalion_id_nickname_key',
      'count_sessions_battalion_id_session_date_shift_key',
      'daily_summary_exports_battalion_id_session_date_key',
      'attendance_week_sends_battalion_id_cron_key_key',
      'app_settings_battalion_id_key_key',
      'issue_forms_battalion_id_form_no_key',
    ]) {
      expect(have.has(name), `${name} is missing`).toBe(true);
    }
  });

  it('still refuses the same personal number or item name twice in one battalion', async () => {
    await expect(
      inRollback(async (tx) => {
        await tx.soldier.create({ data: { firstName: 'א', lastName: 'ב', company: 'A', personalNumber: '7000002' } });
        await tx.soldier.create({ data: { firstName: 'ג', lastName: 'ד', company: 'B', personalNumber: '7000002' } });
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await expect(
      inRollback(async (tx) => {
        await tx.item.create({ data: { name: 'E2E-כפול', category: 'GEAR' } });
        await tx.item.create({ data: { name: 'E2E-כפול', category: 'GEAR' } });
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('numbers 1008 forms from a per-battalion counter, one after another', async () => {
    const [first, second] = await inRollback(async (tx) => [await takeFormNo(tx), await takeFormNo(tx)] as const);
    expect(second).toBe(first + 1);
  });

  it('never hands out a number that is already on file, even if the counter fell behind', async () => {
    // The previous app version can still insert forms from the old sequence while a deploy overlaps.
    const [ahead, next] = await inRollback(async (tx) => {
      const user = await tx.user.create({ data: { username: `e2e-fn-${Date.now()}`, displayName: 'E2E', role: 'admin' } });
      const soldier = await tx.soldier.create({ data: { firstName: 'א', lastName: 'ב', company: 'A' } });
      const probe = await takeFormNo(tx);
      const ahead = probe + 10;
      await tx.issueForm.create({
        data: {
          formNo: ahead,
          soldierId: soldier.id,
          soldierNameSnapshot: 'E2E',
          companySnapshot: 'A',
          signatureImage: 'data:image/png;base64,iVBORw0KGgo=',
          issuedByUserId: user.id,
          issuedByNameSnapshot: 'E2E',
        },
      });
      return [ahead, await takeFormNo(tx)] as const;
    });
    expect(next).toBe(ahead + 1);
  });

  it('keeps the append-only triggers on every audit table', async () => {
    const rows = await prisma.$queryRaw<{ tgrelid: string }[]>`
      SELECT tgrelid::regclass::text AS tgrelid FROM pg_trigger WHERE NOT tgisinternal`;
    const guarded = new Set(rows.map((r) => r.tgrelid));
    for (const table of ['movements', 'issue_forms', 'issue_form_amendments', 'item_kit_changes', 'item_replacements']) {
      expect(guarded.has(table), `${table} lost its append-only trigger`).toBe(true);
    }
  });
});
