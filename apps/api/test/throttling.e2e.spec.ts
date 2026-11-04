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
  await prisma.user.deleteMany({ where: { username: USER.username } });
  await prisma.user.create({
    data: {
      username: USER.username,
      displayName: 'E2E Throttle',
      role: 'viewer',
      passwordHash: await bcrypt.hash(USER.password, 12),
    },
  });
});

afterAll(async () => {
  await prisma?.user.deleteMany({ where: { username: USER.username } });
  await app?.close();
  // Restore the suite-wide default for any file that runs after this one.
  process.env.DISABLE_RATE_LIMIT = 'true';
});

describe('login rate limit', () => {
  it(`allows ${LOGIN_LIMIT} attempts per minute and then returns 429`, async () => {
    const codes: number[] = [];
    for (let i = 0; i < LOGIN_LIMIT + 2; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: USER.username, password: 'wrong-on-purpose' });
      codes.push(res.status);
    }

    // The first attempts are rejected on credentials, not on rate.
    expect(codes.slice(0, LOGIN_LIMIT)).toEqual(Array(LOGIN_LIMIT).fill(401));
    // Everything past the limit is blocked outright.
    expect(codes.slice(LOGIN_LIMIT)).toEqual([429, 429]);
  });

  it('blocks a correct password too once the limit is reached', async () => {
    // The previous case already exhausted the window for this tracker.
    await request(app.getHttpServer()).post('/api/auth/login').send(USER).expect(429);
  });
});
