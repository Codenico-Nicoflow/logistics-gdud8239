/**
 * Who may read what. Written after an audit found routes open to every logged-in user: the full
 * Excel workbook, any soldier's 1008 (with signature image), and the team's attendance. Each
 * role gets the answer it is meant to.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import type { Company, Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const PASSWORD = 'e2e-authz-password-123';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const LAST = 'E2E-הרשאות';

type Account = { username: string; role: Role; companyScope?: Company };
const ACCOUNTS: Record<string, Account> = {
  admin: { username: 'e2e_az_admin', role: 'admin' },
  logistics: { username: 'e2e_az_logistics', role: 'logistics' },
  scopedA: { username: 'e2e_az_logistics_a', role: 'logistics', companyScope: 'A' },
  viewer: { username: 'e2e_az_viewer', role: 'viewer' },
  samgad: { username: 'e2e_az_samgad', role: 'SAMGAD' },
  cmdrB: { username: 'e2e_az_cmdr_b', role: 'COMPANY_CMDR', companyScope: 'B' },
};

let app: INestApplication;
let prisma: PrismaService;
const jars: Record<string, string> = {};
let formA: string;
let formB: string;

async function cleanup(): Promise<void> {
  const soldiers = await prisma.soldier.findMany({ where: { lastName: LAST }, select: { id: true } });
  const ids = soldiers.map((s) => s.id);
  if (ids.length) {
    await prisma.$executeRaw`ALTER TABLE issue_forms DISABLE TRIGGER USER`;
    await prisma.issueForm.deleteMany({ where: { soldierId: { in: ids } } });
    await prisma.$executeRaw`ALTER TABLE issue_forms ENABLE TRIGGER USER`;
    await prisma.soldier.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { username: { in: Object.values(ACCOUNTS).map((a) => a.username) } } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);
  await cleanup();

  const hash = await bcrypt.hash(PASSWORD, 12);
  for (const [key, a] of Object.entries(ACCOUNTS)) {
    await prisma.user.create({
      data: { username: a.username, displayName: key, role: a.role, companyScope: a.companyScope ?? null, passwordHash: hash },
    });
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ username: a.username, password: PASSWORD }).expect(200);
    jars[key] = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
  }

  const issuer = await prisma.user.findUniqueOrThrow({ where: { username: ACCOUNTS.admin!.username } });
  const make = async (company: Company): Promise<string> => {
    const soldier = await prisma.soldier.create({ data: { firstName: `חייל-${company}`, lastName: LAST, company } });
    const form = await prisma.issueForm.create({
      data: {
        soldierId: soldier.id,
        soldierNameSnapshot: `חייל-${company} ${LAST}`,
        companySnapshot: company,
        signatureImage: PNG,
        issuedByUserId: issuer.id,
        issuedByNameSnapshot: 'מנהל',
      },
    });
    return form.id;
  };
  formA = await make('A');
  formB = await make('B');
});

afterAll(async () => {
  await cleanup();
  await app?.close();
});

const as = (who: string) => ({
  get: (path: string) => request(app.getHttpServer()).get(`/api${path}`).set('Cookie', jars[who] as string),
});

describe('Excel export', () => {
  it.each([
    ['viewer', 403],
    ['samgad', 403],
    ['cmdrB', 403],
  ])('is refused to %s', async (who, status) => {
    await as(who).get('/excel/export').expect(status);
  });

  it('is allowed to admin', async () => {
    await as('admin').get('/excel/export').expect(200);
  });
});

describe('1008 issue forms', () => {
  it.each([
    ['samgad', 403],
    ['cmdrB', 403],
  ])('cannot be listed, read or printed by %s', async (who, status) => {
    await as(who).get('/issue-forms').expect(status);
    await as(who).get(`/issue-forms/${formA}`).expect(status);
    await as(who).get(`/issue-forms/${formA}/print`).expect(status);
  });

  it('can be read by admin, logistics and viewer', async () => {
    for (const who of ['admin', 'logistics', 'viewer']) {
      await as(who).get(`/issue-forms/${formA}`).expect(200);
    }
  });

  it('a company-scoped user lists and opens only his own company\'s forms', async () => {
    const list = await as('scopedA').get('/issue-forms?take=200').expect(200);
    const companies = new Set((list.body.rows as { companySnapshot: string }[]).map((r) => r.companySnapshot));
    expect([...companies]).toEqual(['A']);
    await as('scopedA').get(`/issue-forms/${formA}`).expect(200);
    await as('scopedA').get(`/issue-forms/${formB}`).expect(404);
    await as('scopedA').get(`/issue-forms/${formB}/print`).expect(404);
  });

  it('answers 404, not a 500, for an id that is not a UUID or does not exist', async () => {
    await as('admin').get('/issue-forms/not-a-uuid').expect(400);
    await as('admin').get('/issue-forms/00000000-0000-4000-8000-000000000000').expect(404);
  });

  it('refuses a malformed query instead of passing it on', async () => {
    await as('admin').get('/issue-forms?take=abc').expect(400);
    await as('admin').get('/issue-forms?take=100000').expect(400);
    await as('admin').get('/issue-forms?skip=-1').expect(400);
    await as('admin').get("/issue-forms?soldierId=' OR 1=1--").expect(400);
  });
});

describe('attendance reads', () => {
  it.each([['viewer'], ['samgad'], ['cmdrB']])('are refused to %s', async (who) => {
    await as(who).get('/attendance/week').expect(403);
    await as(who).get('/attendance/members').expect(403);
  });

  it('are allowed to admin and logistics', async () => {
    for (const who of ['admin', 'logistics']) {
      await as(who).get('/attendance/week').expect(200);
      await as(who).get('/attendance/members').expect(200);
    }
  });

  it('refuses a malformed date', async () => {
    await as('admin').get('/attendance/week?date=2026-13-45').expect(400);
    await as('admin').get("/attendance/week?date=' OR 1=1").expect(400);
  });
});
