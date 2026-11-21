/**
 * A סגן מפקד פלוגה (companyScope set) sees and edits only his own company's
 * soldiers. The scope has to hold on every soldiers route, not just the list:
 * a hidden list with an open `GET /soldiers/:id` is no scope at all.
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

const CMDR = { username: 'e2e_scope_cmdr', password: 'e2e-scope-cmdr-123' };
const LAST = 'E2E-פלוגה';

let app: INestApplication;
let prisma: PrismaService;
let jar: string;
let aId: string;
let bId: string;
let originalLevel: 'NONE' | 'READ' | 'WRITE' | null = null;

async function cleanup(): Promise<void> {
  await prisma.soldier.deleteMany({ where: { lastName: LAST } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.user.deleteMany({ where: { username: CMDR.username } });
  await prisma.user.create({
    data: {
      username: CMDR.username,
      displayName: 'סמפ א',
      role: 'COMPANY_CMDR',
      companyScope: 'A',
      passwordHash: await bcrypt.hash(CMDR.password, 12),
    },
  });
  // Writes go through the editable matrix; grant this role WRITE so the scope check, not
  // the matrix, is what the write tests exercise. Put back as found.
  originalLevel =
    (await prisma.rolePermission.findUnique({ where: { role_key: { role: 'COMPANY_CMDR', key: 'soldiers' } } }))
      ?.level ?? null;
  await prisma.rolePermission.upsert({
    where: { role_key: { role: 'COMPANY_CMDR', key: 'soldiers' } },
    update: { level: 'WRITE' },
    create: { role: 'COMPANY_CMDR', key: 'soldiers', level: 'WRITE' },
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(CMDR).expect(200);
  jar = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
});

afterAll(async () => {
  await cleanup();
  if (originalLevel === null) {
    await prisma?.rolePermission.deleteMany({ where: { role: 'COMPANY_CMDR', key: 'soldiers' } });
  } else {
    await prisma?.rolePermission.update({
      where: { role_key: { role: 'COMPANY_CMDR', key: 'soldiers' } },
      data: { level: originalLevel },
    });
  }
  await prisma?.user.deleteMany({ where: { username: CMDR.username } });
  await app?.close();
});

beforeEach(async () => {
  await cleanup();
  aId = (await prisma.soldier.create({ data: { firstName: 'שלי', lastName: LAST, company: 'A' } })).id;
  bId = (await prisma.soldier.create({ data: { firstName: 'זר', lastName: LAST, company: 'B' } })).id;
});

const get = (path: string) => request(app.getHttpServer()).get(`/api/${path}`).set('Cookie', jar);

describe('company-scoped soldiers', () => {
  it('lists only his own company, even when asking for another', async () => {
    const own = await get(`soldiers?take=200&q=${encodeURIComponent(LAST)}`).expect(200);
    expect(own.body.rows.map((s: { firstName: string }) => s.firstName)).toEqual(['שלי']);
    const other = await get(`soldiers?take=200&company=B&q=${encodeURIComponent(LAST)}`).expect(200);
    expect(other.body.rows.map((s: { firstName: string }) => s.firstName)).toEqual(['שלי']);
  });

  it('another company\'s soldier does not exist for him', async () => {
    await get(`soldiers/${aId}`).expect(200);
    await get(`soldiers/${bId}`).expect(404);
  });

  it('cannot edit or enlist another company\'s soldier, and cannot delete anyone', async () => {
    const patch = (id: string, body: object) =>
      request(app.getHttpServer()).patch(`/api/soldiers/${id}`).set('Cookie', jar).send(body);
    await patch(bId, { phone: '050-0000000' }).expect(404);
    await patch(aId, { phone: '050-0000000' }).expect(200);
    await request(app.getHttpServer()).delete(`/api/soldiers/${bId}`).set('Cookie', jar).expect(403);
    await request(app.getHttpServer()).delete(`/api/soldiers/${aId}`).set('Cookie', jar).expect(403);
    await request(app.getHttpServer())
      .patch(`/api/soldiers/${bId}/enlistment`)
      .set('Cookie', jar)
      .send({ enlisted: true })
      .expect(404);
  });

  it('cannot add a soldier at all, and cannot move one to another company', async () => {
    const post = (company: string) =>
      request(app.getHttpServer())
        .post('/api/soldiers')
        .set('Cookie', jar)
        .send({ firstName: 'חדש', lastName: LAST, company });
    await post('B').expect(403);
    await post('A').expect(403);
    await request(app.getHttpServer())
      .patch(`/api/soldiers/${aId}`)
      .set('Cookie', jar)
      .send({ company: 'B' })
      .expect(403);
  });
});
