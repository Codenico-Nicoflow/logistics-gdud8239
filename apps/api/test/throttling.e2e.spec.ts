/**
 * Verifies the login rate limit actually enforces.
 *
 * The main auth suite skips rate limiting (see `test/setup.ts`) so its repeated
 * logins are not throttled, which would otherwise leave the limit untested. This
 * file re-enables it for the duration of these cases.
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

const USER = { username: 'e2e_throttle', password: 'e2e-throttle-password-123' };
/** A second account, so the budget-scoping case is not blocked by the cases
 *  above that deliberately exhaust the login window. */
const BROWSER = { username: 'e2e_throttle_browser', password: 'e2e-browser-password-123' };
const FAILURE_LIMIT = 6;

let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  // Re-enable rate limiting: `skipIf` reads this per request.
  delete process.env.DISABLE_RATE_LIMIT;
  process.env.LOGIN_IP_FAILURES_PER_15MIN = String(FAILURE_LIMIT);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();

  prisma = app.get(PrismaService);
  await prisma.user.deleteMany({
    where: { username: { in: [USER.username, BROWSER.username] } },
  });
  await prisma.user.create({
    data: {
      username: USER.username,
      displayName: 'E2E Throttle',
      role: 'viewer',
      passwordHash: await bcrypt.hash(USER.password, 12),
    },
  });
  await prisma.user.create({
    data: {
      username: BROWSER.username,
      displayName: 'E2E Browser',
      role: 'viewer',
      passwordHash: await bcrypt.hash(BROWSER.password, 12),
    },
  });
});

afterAll(async () => {
  await prisma?.user.deleteMany({
    where: { username: { in: [USER.username, BROWSER.username] } },
  });
  await app?.close();
  // Restore the suite-wide default for any file that runs after this one.
  process.env.DISABLE_RATE_LIMIT = 'true';
  delete process.env.LOGIN_IP_FAILURES_PER_15MIN;
});

describe('login rate limit', () => {
  it('does not spend the login budget on ordinary requests', async () => {
    // A named throttler applies to every route unless scoped. The 5/min login
    // limit was previously being spent by ordinary page loads, so a handful of
    // screens would lock the whole app out and the data appeared to vanish.
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(BROWSER)
      .expect(200);
    const jar = (login.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');

    // Far more than a login ever needs.
    for (let i = 0; i < 25; i++) {
      await request(app.getHttpServer()).get('/api/items').set('Cookie', jar).expect(200);
    }
  });

  it('stops a password-spraying IP after too many failures, and then refuses even a correct login', async () => {
    // Guesses across DIFFERENT usernames, so the per-account lockout is not what stops them.
    const codes: number[] = [];
    for (let i = 0; i < FAILURE_LIMIT + 2; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: `e2e_spray_${i}`, password: 'wrong-on-purpose' });
      codes.push(res.status);
    }
    expect(codes.slice(0, FAILURE_LIMIT).every((c) => c === 401)).toBe(true);
    expect(codes.slice(-2)).toEqual([429, 429]);

    // The address stays blocked for everyone on it until the window passes.
    await request(app.getHttpServer()).post('/api/auth/login').send(USER).expect(429);
  });
});
