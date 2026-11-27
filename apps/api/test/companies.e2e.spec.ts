/**
 * Companies are a per-battalion table now, not a fixed enum: anyone signed in can read them, only the
 * admin can change them, new work can only go to an active one, and history keeps pointing at the code.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'e2e-companies-123';
const ADMIN = 'e2e_co_admin';
const STAFF = 'e2e_co_staff';
const LAST = 'E2E-פלוגות';
const TEST_COMPANY = 'E2E פלוגה זמנית';

let app: INestApplication;
let prisma: PrismaService;
const jars: Record<string, string> = {};

async function login(username: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send({ username, password: PASSWORD }).expect(200);
  return (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
}
const as = (who: 'admin' | 'staff') => ({
  get: (url: string) => request(app.getHttpServer()).get(`/api${url}`).set('Cookie', jars[who]!),
  post: (url: string) => request(app.getHttpServer()).post(`/api${url}`).set('Cookie', jars[who]!),
  patch: (url: string) => request(app.getHttpServer()).patch(`/api${url}`).set('Cookie', jars[who]!),
});

async function cleanup(): Promise<void> {
  await prisma.soldier.deleteMany({ where: { lastName: LAST } });
  await prisma.company.deleteMany({ where: { name: { in: [TEST_COMPANY, `${TEST_COMPANY} (שונה)`] } } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);

  await cleanup();
  await prisma.user.deleteMany({ where: { username: { in: [ADMIN, STAFF] } } });
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await prisma.user.create({ data: { username: ADMIN, displayName: 'מנהל', role: 'admin', passwordHash } });
  await prisma.user.create({ data: { username: STAFF, displayName: 'לוגיסטיקה', role: 'logistics', passwordHash } });
  jars.admin = await login(ADMIN);
  jars.staff = await login(STAFF);
});

afterAll(async () => {
  await cleanup();
  await prisma?.user.deleteMany({ where: { username: { in: [ADMIN, STAFF] } } });
  await app?.close();
});

describe('reading companies', () => {
  it("returns the battalion's companies in their own order, for any signed-in role", async () => {
    const res = await as('staff').get('/companies').expect(200);
    const codes = (res.body as { code: string }[]).map((c) => c.code);
    expect(codes.slice(0, 5)).toEqual(['A', 'B', 'C', 'SUPPORT', 'HQ']);
    expect((res.body as { name: string }[])[3]?.name).toBe('מסייעת');
  });
});

describe('changing companies', () => {
  it('is refused to anyone but the admin', async () => {
    await as('staff').post('/companies').send({ name: TEST_COMPANY }).expect(403);
  });

  it('creates a company with a generated code, after the existing ones, and refuses a duplicate name', async () => {
    const created = await as('admin').post('/companies').send({ name: TEST_COMPANY }).expect(201);
    const body = created.body as { id: string; code: string; sortOrder: number; isActive: boolean };
    expect(body.code).toMatch(/^c_[0-9a-f]{8}$/);
    expect(body.isActive).toBe(true);
    expect(body.sortOrder).toBeGreaterThanOrEqual(5);
    await as('admin').post('/companies').send({ name: TEST_COMPANY }).expect(409);
  });

  it('renames and reorders, but never changes the code', async () => {
    const company = await prisma.company.findFirstOrThrow({ where: { name: TEST_COMPANY } });
    const res = await as('admin').patch(`/companies/${company.id}`).send({ name: `${TEST_COMPANY} (שונה)` }).expect(200);
    expect((res.body as { code: string; name: string }).code).toBe(company.code);
    expect((res.body as { name: string }).name).toBe(`${TEST_COMPANY} (שונה)`);
    // the code is not a writable field at all
    await as('admin').patch(`/companies/${company.id}`).send({ code: 'HACK' }).expect(400);
  });
});

describe('assigning soldiers to companies', () => {
  const soldier = (company: string) => ({ firstName: 'בודק', lastName: LAST, company });

  it('refuses a company that does not exist', async () => {
    const res = await as('admin').post('/soldiers').send(soldier('NOPE')).expect(400);
    expect((res.body as { message: string }).message).toContain('פלוגה לא חוקית');
  });

  it('refuses a deactivated company for new work, but still lets its existing soldiers be edited', async () => {
    const company = await prisma.company.findFirstOrThrow({ where: { name: `${TEST_COMPANY} (שונה)` } });
    const made = await as('admin').post('/soldiers').send(soldier(company.code)).expect(201);
    const id = (made.body as { id: string }).id;

    await as('admin').patch(`/companies/${company.id}`).send({ isActive: false }).expect(200);

    await as('admin').post('/soldiers').send(soldier(company.code)).expect(400);
    // an unchanged company on an existing soldier is not a new assignment
    await as('admin').patch(`/soldiers/${id}`).send({ firstName: 'נערך', company: company.code }).expect(200);
    // moving him out is fine too
    await as('admin').patch(`/soldiers/${id}`).send({ company: 'A' }).expect(200);
  });

  it('cannot delete a company that still has soldiers (the database refuses)', async () => {
    const company = await prisma.company.findFirstOrThrow({ where: { name: `${TEST_COMPANY} (שונה)` } });
    await prisma.soldier.updateMany({ where: { lastName: LAST }, data: { company: company.code } });
    await expect(prisma.company.delete({ where: { id: company.id } })).rejects.toMatchObject({ code: 'P2003' });
  });
});

describe('ordering by company', () => {
  it("groups the roster in the companies' own order (SUPPORT before HQ), not alphabetically by code", async () => {
    await prisma.soldier.deleteMany({ where: { lastName: LAST } });
    await prisma.soldier.createMany({
      data: [
        { firstName: 'א', lastName: LAST, company: 'HQ' },
        { firstName: 'ב', lastName: LAST, company: 'SUPPORT' },
        { firstName: 'ג', lastName: LAST, company: 'A' },
      ],
    });
    const res = await as('admin').get(`/soldiers?q=${encodeURIComponent(LAST)}&sort=company`).expect(200);
    const order = (res.body as { rows: { company: string }[] }).rows.map((r) => r.company);
    expect(order).toEqual(['A', 'SUPPORT', 'HQ']);
  });
});
