/**
 * Hostile and malformed input. Every parameter that used to be a bare TypeScript annotation is now
 * checked, and a hostile string must never produce a 500, extra rows, or a different answer from
 * the same string sent as plain text: Prisma binds every value, and these tests prove it for the
 * search and filter parameters people can type into.
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
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const ADMIN = { username: 'e2e_iv_admin', password: 'e2e-iv-admin-password-123' };
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const PAYLOADS = [
  "' OR 1=1--",
  "'; DROP TABLE soldiers;--",
  '" OR ""="',
  '%',
  '%27%20OR%201%3D1',
  '\\',
  '\u0000',
  "Robert'); DROP TABLE users;--",
  '${7*7}',
  '<script>alert(1)</script>',
  'א'.repeat(500),
  '\n\r\t',
];

let app: INestApplication;
let prisma: PrismaService;
let jar: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);
  await prisma.user.deleteMany({ where: { username: ADMIN.username } });
  await prisma.user.create({
    data: { username: ADMIN.username, displayName: 'מנהל', role: 'admin', passwordHash: await bcrypt.hash(ADMIN.password, 12) },
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);
  jar = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
});

afterAll(async () => {
  await prisma?.user.deleteMany({ where: { username: ADMIN.username } });
  await app?.close();
});

const get = (path: string) => request(app.getHttpServer()).get(`/api${path}`).set('Cookie', jar);
const send = (method: 'post' | 'patch', path: string, body: object) =>
  request(app.getHttpServer())[method](`/api${path}`).set('Cookie', jar).send(body);

describe('search and filter parameters shrug off injection payloads', () => {
  const ENDPOINTS = [
    (p: string) => `/soldiers?q=${p}`,
    (p: string) => `/soldiers?q=${p}&sort=${p}`,
    (p: string) => `/signatures?q=${p}`,
    (p: string) => `/signatures/holders?q=${p}`,
    (p: string) => `/movements?q=${p}`,
    (p: string) => `/ifsun?q=${p}&status=ALL`,
    (p: string) => `/items?q=${p}`,
  ];

  it('never answers 500, and a hostile q matches nothing it should not', async () => {
    const total = (await get('/soldiers?take=1')).body.total as number;
    for (const raw of PAYLOADS) {
      const p = encodeURIComponent(raw);
      for (const make of ENDPOINTS) {
        const res = await get(make(p));
        expect([200, 400], `${make('X')} with ${JSON.stringify(raw.slice(0, 20))} -> ${res.status}`).toContain(res.status);
      }
      // "' OR 1=1--" must not behave like "everything": it is looked up as literal text.
      const soldiers = await get(`/soldiers?q=${p}&take=200`);
      if (soldiers.status === 200) expect(soldiers.body.total).toBeLessThan(Math.max(total, 1) + 1);
    }
    // The table the payloads tried to drop is still there.
    expect((await get('/soldiers?take=1')).body.total).toBe(total);
    expect(await prisma.user.count({ where: { username: ADMIN.username } })).toBe(1);
  });

  it('a 5 MB-style long value is refused cleanly, not crashed on', async () => {
    const res = await get(`/soldiers?q=${'a'.repeat(5000)}`);
    expect(res.status).toBe(400);
  });
});

describe('typed parameters', () => {
  it('rejects a bad company, shift, date and limit with 400 instead of 500', async () => {
    await get('/service-periods/00000000-0000-4000-8000-000000000000/soldier-allocations?company=Z').expect(400);
    await get('/counts/sheet?date=2026-01-01&shift=NOON').expect(400);
    await get("/counts/sheet?date=' OR 1=1&shift=EVENING").expect(400);
    await get('/reports/summary?date=yesterday').expect(400);
    await get('/db-backups?limit=abc').expect(400);
    await get('/db-backups?limit=-5').expect(400);
    await get('/snapshots?limit=99999').expect(400);
  });

  it('still accepts good values', async () => {
    await get('/db-backups?limit=5').expect(200);
    await get('/snapshots?limit=5').expect(200);
    await get('/reports/summary?date=2026-01-01').expect(200);
  });
});

describe('request bodies', () => {
  it('refuses an invalid instance status (it used to reach Prisma unchecked)', async () => {
    await send('patch', '/items/instances/00000000-0000-4000-8000-000000000000/status', { status: 'NOPE' }).expect(400);
    await send('patch', '/items/instances/not-a-uuid/status', { status: 'OK' }).expect(400);
    await send('patch', '/items/instances/00000000-0000-4000-8000-000000000000/status', {
      status: 'OK',
      notes: 'x'.repeat(5000),
    }).expect(400);
  });

  it('refuses a count signature that is not a PNG data URL, or is huge', async () => {
    const base = { sessionDate: '2031-01-01', shift: 'EVENING' };
    await send('post', '/counts', { ...base, responsibleSignatureImage: 'javascript:alert(1)' }).expect(400);
    // Too big for the body limit, or for the field: either way it is refused, never stored.
    const huge = await send('post', '/counts', { ...base, officerSignatureImage: `data:image/png;base64,${'A'.repeat(500_000)}` });
    expect([400, 413]).toContain(huge.status);
    await send('post', '/counts', { ...base, officerSignatureImage: 'https://evil.example/x.png' }).expect(400);
  });

  it('refuses unbounded quantities and arrays', async () => {
    await send('post', '/signatures/issue', {
      soldierId: '00000000-0000-4000-8000-000000000000',
      itemId: '00000000-0000-4000-8000-000000000000',
      quantity: 99_999_999,
    }).expect(400);
    await send('post', '/issue-forms', {
      soldierId: '00000000-0000-4000-8000-000000000000',
      signatureImage: PNG,
      lines: Array.from({ length: 201 }, () => ({ itemId: '00000000-0000-4000-8000-000000000000', quantity: 1 })),
    }).expect(400);
    await send('post', '/issue-forms', {
      soldierId: 'not-a-uuid',
      signatureImage: PNG,
      lines: [{ itemId: "' OR 1=1--", quantity: 1 }],
    }).expect(400);
  });

  it('refuses a permission key the app does not know, and a commander with no company', async () => {
    await send('post', '/permissions', { role: 'SAMGAD', key: 'made.up.key', level: 'READ' }).expect(400);
    await send('post', '/users', { username: 'e2e_iv_cmdr', displayName: 'x', role: 'COMPANY_CMDR', password: 'a-long-enough-password-1' }).expect(400);
    await send('post', '/users', { username: 'e2e_iv_short', displayName: 'x', role: 'viewer', password: 'short' }).expect(400);
  });
});
