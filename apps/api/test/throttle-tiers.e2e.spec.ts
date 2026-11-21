/**
 * The per-route tiers: a heavy route gets 10 a minute per USER (not per shared IP), and a
 * password-change route gets 5 per 15 minutes. Rate limiting is switched back on for this file.
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

const A = { username: 'e2e_tier_a', password: 'e2e-tier-a-password-123' };
const B = { username: 'e2e_tier_b', password: 'e2e-tier-b-password-123' };
// Not a real id: the throttler runs before the handler, so a 404 still spends the budget — and is cheap.
const MISSING = '00000000-0000-4000-8000-000000000000';

let app: INestApplication;
let prisma: PrismaService;
let jarA: string;
let jarB: string;

const jarOf = (res: request.Response): string =>
  (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');

beforeAll(async () => {
  delete process.env.DISABLE_RATE_LIMIT;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.user.deleteMany({ where: { username: { in: [A.username, B.username] } } });
  for (const u of [A, B]) {
    await prisma.user.create({
      data: { username: u.username, displayName: u.username, role: 'admin', passwordHash: await bcrypt.hash(u.password, 12) },
    });
  }
  jarA = jarOf(await request(app.getHttpServer()).post('/api/auth/login').send(A).expect(200));
  jarB = jarOf(await request(app.getHttpServer()).post('/api/auth/login').send(B).expect(200));
});

afterAll(async () => {
  await prisma?.user.deleteMany({ where: { username: { in: [A.username, B.username] } } });
  await app?.close();
  process.env.DISABLE_RATE_LIMIT = 'true';
});

// A heavy-tier route (admin download); a missing id answers 404 cheaply, but the budget is spent first.
const heavy = (jar: string) => request(app.getHttpServer()).get(`/api/db-backups/${MISSING}/download`).set('Cookie', jar);

describe('print tier', () => {
  it('lets a signing day print a stack of forms (far above the heavy-route budget)', async () => {
    for (let i = 0; i < 40; i++) {
      const res = await request(app.getHttpServer()).get(`/api/ifsun/${MISSING}/print`).set('Cookie', jarB);
      expect(res.status).toBe(404);
    }
  });
});

describe('throttle tiers', () => {
  it('limits a heavy route to 10 a minute per user and answers 429 in Hebrew', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await heavy(jarA)).status);
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses[10]).toBe(429);

    const blocked = await heavy(jarA);
    expect(blocked.status).toBe(429);
    expect(JSON.stringify(blocked.body)).toContain('יותר מדי בקשות');
  });

  it('keys by user, not by the shared IP: another user on the same address is unaffected', async () => {
    // jarA is exhausted from the case above; both clients share 127.0.0.1.
    expect((await heavy(jarA)).status).toBe(429);
    expect((await heavy(jarB)).status).toBe(404);
  });

  it('does not touch ordinary routes with the heavy budget', async () => {
    for (let i = 0; i < 15; i++) {
      await request(app.getHttpServer()).get('/api/items').set('Cookie', jarB).expect(200);
    }
  });

  it('limits password changes to 5 per 15 minutes', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Cookie', jarB)
        .send({ currentPassword: 'wrong-current-password', newPassword: 'a-brand-new-password-12345' });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});

describe('one shared address (the whole unit on one network)', () => {
  it('refresh is limited per session, so one session cannot spend another one\'s budget', async () => {
    const refreshOf = (jar: string): string => jar.split('; ').find((c) => c.startsWith('logistics_refresh=')) ?? '';
    const a = refreshOf(jarA);
    const b = refreshOf(jarB);

    // Same fake cookie again and again (each is 401, but it still spends THAT session's budget).
    const statuses: number[] = [];
    for (let i = 0; i < 62; i++) {
      statuses.push((await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', `${a}x`)).status);
    }
    expect(statuses.slice(-1)[0]).toBe(429);

    // Another session on the same IP is untouched.
    const other = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', `${b}x`);
    expect(other.status).not.toBe(429);
  });

  it('a morning of logins from one address is never throttled', { timeout: 30_000 }, async () => {
    // The old limit was 5 a minute for the whole address; 15 successes in a row would have failed it.
    for (let i = 0; i < 15; i++) {
      await request(app.getHttpServer()).post('/api/auth/login').send(A).expect(200);
    }
  });
});
