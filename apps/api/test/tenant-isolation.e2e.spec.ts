/**
 * Tenant isolation, proven where it is enforced: in the database. Three layers —
 *  1. the schema: every table that holds a battalion's data is under row-level security, found by
 *     introspection so a future table cannot slip through;
 *  2. the connection: with the restricted role, a connection sees only the battalion it was told it serves,
 *     through every query path Prisma has (plain, interactive transaction, batch, raw), under concurrency
 *     and with a saturated pool;
 *  3. the API: a user of one battalion cannot read, change or reach another's data, and a token cannot be
 *     re-pointed.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { HOME_BATTALION_ID } from '../src/common/home-battalion';
import { rlsProblems } from '../src/prisma/rls-check';
import { TenantPool } from '../src/tenancy/tenant-pool';
import { runAsBattalion } from '../src/tenancy/tenant-context';
import { ownerExec, ownerQuery } from './owner';

const PASSWORD = 'e2e-isolation-password-123';
const B = 'e2e-iso-battalion-b';
const LAST = 'E2E-בידוד';
const USERS = { a: 'e2e_iso_a', b: 'e2e_iso_b' };

const appUrl = (): string => {
  const url = process.env.APP_DATABASE_URL;
  if (!url) throw new Error('APP_DATABASE_URL is not set');
  return url;
};

/** Tables that hold no battalion data, and why each is exempt. Adding a table means deciding, here. */
const NOT_PER_BATTALION: Record<string, string> = {
  _prisma_migrations: 'the migration ledger; the app role has no access to it',
  role_permissions: 'one matrix for the deployment; only the platform admin may change it',
  db_backups: 'whole-database dumps; platform admin only',
  refresh_tokens: 'follows its user (policy through users)',
  user_invites: 'follows its user (policy through users)',
  user_totp: 'follows its user (policy through users)',
  totp_backup_codes: 'follows its user (policy through users)',
  battalions: 'a battalion sees only itself (policy on id)',
};

let owner: PrismaClient;
let appPool: TenantPool;
let app: INestApplication;
let prisma: PrismaService;
const jars: Record<string, string> = {};
let soldierA: string;
let soldierB: string;

async function cleanup(): Promise<void> {
  await ownerExec(`DELETE FROM soldiers WHERE last_name = '${LAST}'`);
  await ownerExec(`DELETE FROM items WHERE name LIKE 'E2E-בידוד%'`);
  await ownerExec(`DELETE FROM security_events WHERE battalion_id = '${B}'`);
  await ownerExec(`DELETE FROM users WHERE username IN ('${USERS.a}', '${USERS.b}')`);
  await ownerExec(`DELETE FROM companies WHERE battalion_id = '${B}'`);
  await ownerExec(`DELETE FROM form_counters WHERE battalion_id = '${B}'`);
  await ownerExec(`DELETE FROM battalions WHERE id = '${B}'`);
}

beforeAll(async () => {
  await cleanup();
  const ownerUrl = process.env.DATABASE_URL;
  if (!ownerUrl) throw new Error('DATABASE_URL is not set');
  owner = new PrismaClient({ adapter: new PrismaPg(new TenantPool({ connectionString: ownerUrl, fallbackBattalionId: HOME_BATTALION_ID }), { disposeExternalPool: true }) });

  await owner.battalion.create({ data: { id: B, name: 'E2E גדוד ב', number: 'E2E-ISO' } });
  await owner.company.create({ data: { battalionId: B, code: 'X', name: 'פלוגה X' } });
  const hash = await bcrypt.hash(PASSWORD, 12);
  await owner.user.create({ data: { username: USERS.a, displayName: 'א', role: 'admin', passwordHash: hash, battalionId: HOME_BATTALION_ID } });
  await owner.user.create({ data: { username: USERS.b, displayName: 'ב', role: 'admin', passwordHash: hash, battalionId: B } });
  soldierA = (await owner.soldier.create({ data: { firstName: 'חייל', lastName: LAST, company: 'A', battalionId: HOME_BATTALION_ID } })).id;
  soldierB = (await owner.soldier.create({ data: { firstName: 'חייל', lastName: LAST, company: 'X', battalionId: B } })).id;
  await owner.item.create({ data: { name: 'E2E-בידוד-א', category: 'GEAR', battalionId: HOME_BATTALION_ID } });
  await owner.item.create({ data: { name: 'E2E-בידוד-ב', category: 'GEAR', battalionId: B } });

  // No fallback: a connection with no battalion in scope must see nothing.
  appPool = new TenantPool({ connectionString: appUrl(), max: 1 });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);

  for (const [key, username] of Object.entries(USERS)) {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ username, password: PASSWORD }).expect(200);
    jars[key] = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
  }
});

afterAll(async () => {
  await cleanup();
  await app?.close();
  await appPool?.end();
  await owner?.$disconnect();
});

const as = (who: 'a' | 'b') => ({
  get: (path: string) => request(app.getHttpServer()).get(`/api${path}`).set('Cookie', jars[who] as string),
  patch: (path: string, body: object) => request(app.getHttpServer()).patch(`/api${path}`).set('Cookie', jars[who] as string).send(body),
  del: (path: string) => request(app.getHttpServer()).delete(`/api${path}`).set('Cookie', jars[who] as string),
});

async function scalar(sql: string, battalionId: string | null, values: unknown[] = []): Promise<string> {
  const run = async (): Promise<string> => {
    const { rows } = await appPool.query<{ v: string }>(sql, values);
    return String(rows[0]?.v);
  };
  return battalionId === null ? run() : runAsBattalion(battalionId, run);
}

describe('the schema: every tenant table is under row-level security', () => {
  it('has row-level security and a policy on every table with battalion_id', async () => {
    const rows = await ownerQuery<{ table: string; rls: boolean; policies: string }>(`
      SELECT c.relname AS "table", c.relrowsecurity AS rls,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::text AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'battalion_id' AND NOT a.attisdropped
      WHERE c.relkind = 'r' AND c.relname <> 'battalions'`);
    expect(rows.length).toBeGreaterThan(30);
    const bad = rows.filter((r) => !r.rls || Number(r.policies) < 1).map((r) => r.table);
    expect(bad).toEqual([]);
  });

  it('makes every table either per-battalion or a documented exception', async () => {
    const rows = await ownerQuery<{ table: string }>(`
      SELECT c.relname AS "table" FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relkind = 'r'
        AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'battalion_id' AND NOT a.attisdropped)`);
    const undecided = rows.map((r) => r.table).filter((t) => !(t in NOT_PER_BATTALION));
    expect(undecided).toEqual([]);
  });

  it('is not bypassed by the application role', async () => {
    const [r] = await ownerQuery<{ rolsuper: boolean; rolbypassrls: boolean }>(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'logistics_app'`);
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
    const owned = await ownerQuery(`SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'logistics_app'`);
    expect(owned).toHaveLength(0);
  });
});

describe('the connection: a battalion sees only its own rows, on every table', () => {
  it('sees no rows at all with no battalion in scope, on every tenant table', async () => {
    const tables = await ownerQuery<{ table: string }>(`
      SELECT c.relname AS "table" FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'battalion_id' AND NOT a.attisdropped WHERE c.relkind = 'r'`);
    for (const { table } of tables) {
      expect(await scalar(`SELECT count(*)::text AS v FROM "${table}"`, null), table).toBe('0');
    }
  });

  it("never returns a row of another battalion, on every tenant table", async () => {
    const tables = await ownerQuery<{ table: string }>(`
      SELECT c.relname AS "table" FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'battalion_id' AND NOT a.attisdropped WHERE c.relkind = 'r'`);
    for (const { table } of tables) {
      expect(await scalar(`SELECT count(*)::text AS v FROM "${table}" WHERE battalion_id <> $1`, B, [B]), `${table} as B`).toBe('0');
      expect(await scalar(`SELECT count(*)::text AS v FROM "${table}" WHERE battalion_id <> $1`, HOME_BATTALION_ID, [HOME_BATTALION_ID]), `${table} as 8239`).toBe('0');
    }
  });

  it('shows each battalion its own soldier and not the other', async () => {
    expect(await scalar(`SELECT count(*)::text AS v FROM soldiers WHERE last_name = '${LAST}'`, B)).toBe('1');
    expect(await scalar(`SELECT count(*)::text AS v FROM soldiers WHERE id = '${soldierA}'`, B)).toBe('0');
    expect(await scalar(`SELECT count(*)::text AS v FROM soldiers WHERE id = '${soldierB}'`, HOME_BATTALION_ID)).toBe('0');
  });

  it('refuses a create with no battalion, and a create into another battalion', async () => {
    await expect(appPool.query(`INSERT INTO soldiers (id, first_name, last_name, company, updated_at) VALUES ('e2e-iso-x', 'x', 'y', 'A', now())`)).rejects.toThrow();
    await expect(
      runAsBattalion(B, () =>
        appPool.query(`INSERT INTO soldiers (id, battalion_id, first_name, last_name, company, updated_at) VALUES ('e2e-iso-y', $1, 'x', 'y', 'A', now())`, [HOME_BATTALION_ID]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot update or delete another battalion’s row', async () => {
    const upd = await runAsBattalion(B, () => appPool.query(`UPDATE soldiers SET first_name = 'שונה' WHERE id = $1`, [soldierA]));
    expect(upd.rowCount).toBe(0);
    const del = await runAsBattalion(B, () => appPool.query(`DELETE FROM soldiers WHERE id = $1`, [soldierA]));
    expect(del.rowCount).toBe(0);
    const [still] = await ownerQuery<{ first_name: string }>(`SELECT first_name FROM soldiers WHERE id = $1`, [soldierA]);
    expect(still?.first_name).toBe('חייל');
  });

  it('cannot move a row into another battalion by updating battalion_id', async () => {
    await expect(runAsBattalion(B, () => appPool.query(`UPDATE soldiers SET battalion_id = $1 WHERE id = $2`, [HOME_BATTALION_ID, soldierB]))).rejects.toThrow(/row-level security/);
  });

  it('does not carry a battalion over to the next user of the same connection', async () => {
    // The pool holds one connection, so these three queries reuse it back to back.
    expect(await scalar(`SELECT current_battalion_id() AS v`, B)).toBe(B);
    expect(await scalar(`SELECT coalesce(current_battalion_id(), 'none') AS v`, null)).toBe('none');
    expect(await scalar(`SELECT current_battalion_id() AS v`, HOME_BATTALION_ID)).toBe(HOME_BATTALION_ID);
  });

  it('keeps concurrent requests apart, even with every connection busy', async () => {
    const ids = [B, HOME_BATTALION_ID];
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => {
        const id = ids[i % 2] as string;
        return runAsBattalion(id, async () => ({ id, saw: await scalar(`SELECT current_battalion_id() AS v`, id) }));
      }),
    );
    expect(results.filter((r) => r.id !== r.saw)).toEqual([]);
  });
});

describe('Prisma: every query path is filtered', () => {
  it('filters plain queries by the battalion in scope', async () => {
    const asB = await runAsBattalion(B, () => prisma.soldier.findMany({ where: { lastName: LAST } }));
    expect(asB.map((s) => s.id)).toEqual([soldierB]);
    const asA = await runAsBattalion(HOME_BATTALION_ID, () => prisma.soldier.findMany({ where: { lastName: LAST } }));
    expect(asA.map((s) => s.id)).toEqual([soldierA]);
  });

  it('filters inside an interactive transaction', async () => {
    const seen = await runAsBattalion(B, () =>
      prisma.$transaction(async (tx) => {
        await tx.item.findFirst();
        return tx.soldier.findMany({ where: { lastName: LAST } });
      }),
    );
    expect(seen.map((s) => s.id)).toEqual([soldierB]);
  });

  it('filters inside a batch transaction', async () => {
    const [soldiers, items] = await runAsBattalion(B, () =>
      prisma.$transaction([prisma.soldier.findMany({ where: { lastName: LAST } }), prisma.item.findMany({ where: { name: { startsWith: 'E2E-בידוד' } } })]),
    );
    expect(soldiers.map((s) => s.id)).toEqual([soldierB]);
    expect(items.map((i) => i.name)).toEqual(['E2E-בידוד-ב']);
  });

  it('filters raw SQL', async () => {
    const rows = await runAsBattalion(B, () => prisma.$queryRaw<{ id: string }[]>`SELECT id FROM soldiers WHERE last_name = ${LAST}`);
    expect(rows.map((r) => r.id)).toEqual([soldierB]);
  });

  it('fills a create with the battalion in scope, and fails loudly with none', async () => {
    const made = await runAsBattalion(B, () => prisma.item.create({ data: { name: 'E2E-בידוד-נוצר', category: 'GEAR' } }));
    expect(made.battalionId).toBe(B);
    // Inside a request-like scope with nothing bound there is no fallback: the create must be refused.
    await expect(runAsBattalion('', () => prisma.item.create({ data: { name: 'E2E-בידוד-ריק', category: 'GEAR' } }))).rejects.toThrow();
  });
});

describe('the API: one battalion cannot reach another', () => {
  it('shows each user their own battalion on login', async () => {
    const a = await as('a').get('/auth/me').expect(200);
    const b = await as('b').get('/auth/me').expect(200);
    expect(a.body.user.battalionId).toBe(HOME_BATTALION_ID);
    expect(b.body.user.battalionId).toBe(B);
  });

  it('lists only the caller’s soldiers', async () => {
    const ids = async (who: 'a' | 'b'): Promise<string[]> => {
      const res = await as(who).get(`/soldiers?q=${encodeURIComponent(LAST)}`).expect(200);
      return (res.body as { rows: { id: string }[] }).rows.map((s) => s.id);
    };
    const idsB = await ids('b');
    expect(idsB).toContain(soldierB);
    expect(idsB).not.toContain(soldierA);
    const idsA = await ids('a');
    expect(idsA).toContain(soldierA);
    expect(idsA).not.toContain(soldierB);
  });

  it('answers 404, not 403 or data, for another battalion’s soldier by id', async () => {
    await as('b').get(`/soldiers/${soldierA}`).expect(404);
    await as('a').get(`/soldiers/${soldierB}`).expect(404);
  });

  it('cannot change or delete another battalion’s soldier', async () => {
    await as('b').patch(`/soldiers/${soldierA}`, { firstName: 'פרצתי' }).expect(404);
    await as('b').del(`/soldiers/${soldierA}`).expect(404);
    const [row] = await ownerQuery<{ first_name: string }>(`SELECT first_name FROM soldiers WHERE id = $1`, [soldierA]);
    expect(row?.first_name).toBe('חייל');
  });

  it('shows each battalion only its own companies', async () => {
    const asB = await as('b').get('/companies').expect(200);
    expect((asB.body as { code: string }[]).map((c) => c.code)).toEqual(['X']);
    const asA = await as('a').get('/companies').expect(200);
    expect((asA.body as { code: string }[]).map((c) => c.code)).not.toContain('X');
  });

  it('refuses a token re-pointed at another battalion', async () => {
    const jwt = app.get(JwtService);
    const forged = await jwt.signAsync(
      { sub: (await owner.user.findFirstOrThrow({ where: { username: USERS.a } })).id, username: USERS.a, role: 'admin', companyScope: null, battalionId: B, iatMs: Date.now() },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '5m' },
    );
    await request(app.getHttpServer()).get('/api/soldiers').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('refuses a token that names no battalion', async () => {
    const jwt = app.get(JwtService);
    const old = await jwt.signAsync(
      { sub: (await owner.user.findFirstOrThrow({ where: { username: USERS.a } })).id, username: USERS.a, role: 'admin', companyScope: null, iatMs: Date.now() },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '5m' },
    );
    await request(app.getHttpServer()).get('/api/soldiers').set('Authorization', `Bearer ${old}`).expect(401);
  });

  it('refreshes a session inside its own battalion', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ username: USERS.b, password: PASSWORD }).expect(200);
    const cookies = (login.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    const refreshed = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookies).expect(200);
    const jar = (refreshed.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', jar).expect(200);
    expect(me.body.user.battalionId).toBe(B);
  });

  it('a wrong password for either battalion fails the same way as an unknown name', async () => {
    const wrong = await request(app.getHttpServer()).post('/api/auth/login').send({ username: USERS.b, password: 'nope-nope-nope-1' }).expect(401);
    const unknown = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'e2e_iso_nobody', password: 'nope-nope-nope-1' }).expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('keeps a battalion admin out of the platform-wide routes', async () => {
    await as('b').get('/db-backups').expect(403);
    await as('a').get('/db-backups').expect(403);
    await as('b').get('/permissions').expect(403);
  });
});

describe('the startup check and the Slack bridge', () => {
  it('names every way a connection could bypass row-level security', () => {
    const safe = { role: 'logistics_app', superuser: false, bypassRls: false, ownedTables: [], unprotectedTables: [] };
    expect(rlsProblems(safe)).toEqual([]);
    expect(rlsProblems({ ...safe, superuser: true })).toHaveLength(1);
    expect(rlsProblems({ ...safe, bypassRls: true })).toHaveLength(1);
    expect(rlsProblems({ ...safe, ownedTables: ['soldiers'] })).toHaveLength(1);
    expect(rlsProblems({ ...safe, unprotectedTables: ['new_table'] })).toHaveLength(1);
  });

  it('refuses to start when connected as the database owner', async () => {
    const saved = process.env.APP_DATABASE_URL;
    process.env.APP_DATABASE_URL = process.env.DATABASE_URL;
    const service = new PrismaService();
    try {
      await expect(service.onModuleInit()).rejects.toThrow(/not tenant-safe/);
    } finally {
      process.env.APP_DATABASE_URL = saved;
      await service.onModuleDestroy();
    }
  });

  it('starts as the restricted role', async () => {
    const service = new PrismaService();
    try {
      await expect(service.onModuleInit()).resolves.toBeUndefined();
    } finally {
      await service.onModuleDestroy();
    }
  });

});
