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
const LOGIN_LIMIT = 5;

let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  // Re-enable rate limiting: `skipIf` reads this per request.
  delete process.env.DISABLE_RATE_LIMIT;

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

    // Comfortably more than the login limit of 5.
    for (let i = 0; i < 25; i++) {
      await request(app.getHttpServer()).get('/api/items').set('Cookie', jar).expect(200);
    }
  });

  it(`allows ${LOGIN_LIMIT} attempts per minute and then returns 429`, async () => {
    const codes: number[] = [];
    for (let i = 0; i < LOGIN_LIMIT + 2; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: USER.username, password: 'wrong-on-purpose' });
      codes.push(res.status);
    }

    // Login is tracked by IP, and the scoping case above already used one of
    // the attempts, so the exact cut-off shifts. What matters is that some
    // attempts are judged on credentials and the rest are blocked on rate.
    expect(codes.filter((c) => c === 401).length).toBeGreaterThan(0);
    expect(codes.slice(-2)).toEqual([429, 429]);
  });

  it('blocks a correct password too once the limit is reached', async () => {
    // The previous case already exhausted the window for this tracker.
    await request(app.getHttpServer()).post('/api/auth/login').send(USER).expect(429);
  });

});
