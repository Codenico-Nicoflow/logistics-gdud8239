/**
 * End-to-end auth behaviour, exercised through the real HTTP stack against the
 * dev database. These cover the properties that are easy to break silently:
 * no user enumeration, httpOnly cookies, role enforcement, refresh rotation,
 * stolen-token response, and immediate effect of deactivation.
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

const ADMIN = { username: 'e2e_admin', password: 'e2e-admin-password-123' };
const STAFF = { username: 'e2e_staff', password: 'e2e-staff-password-123' };

let app: INestApplication;
let prisma: PrismaService;

/** Pulls a named cookie out of a set-cookie header array. */
function cookie(headers: string[] | undefined, name: string): string | undefined {
  return headers?.find((c) => c.startsWith(`${name}=`));
}

function cookieValue(raw: string | undefined): string | undefined {
  return raw?.split(';')[0];
}

function jarFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[];
  return raw.map(cookieValue).join('; ');
}

beforeAll(async () => {
  // Rate limiting is skipped here via DISABLE_RATE_LIMIT (see test/setup.ts);
  // the login limit is verified on its own in `throttling.e2e.spec.ts`.
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();

  prisma = app.get(PrismaService);

  for (const u of [ADMIN, STAFF]) {
    await prisma.user.deleteMany({ where: { username: u.username } });
  }
  await prisma.user.create({
    data: {
      username: ADMIN.username,
      displayName: 'E2E Admin',
      role: 'admin',
      passwordHash: await bcrypt.hash(ADMIN.password, 12),
    },
  });
  await prisma.user.create({
    data: {
      username: STAFF.username,
      displayName: 'E2E Staff',
      role: 'logistics',
      passwordHash: await bcrypt.hash(STAFF.password, 12),
    },
  });
});

afterAll(async () => {
  for (const u of [ADMIN, STAFF]) {
    await prisma?.user.deleteMany({ where: { username: u.username } });
  }
  await app?.close();
});

describe('login', () => {
  it('rejects an unauthenticated request to a protected route', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('gives the same message for a wrong password and an unknown user', async () => {
    const wrongPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: ADMIN.username, password: 'nope' })
      .expect(401);
    const unknownUser = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'does_not_exist_at_all', password: 'nope' })
      .expect(401);

    // Differing messages would let an attacker enumerate valid usernames.
    expect(wrongPassword.body.message).toBe(unknownUser.body.message);
  });

  it('sets httpOnly cookies and returns no token in the body', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);

    const raw = res.headers['set-cookie'] as unknown as string[];
    expect(cookie(raw, 'logistics_access')).toMatch(/HttpOnly/i);
    expect(cookie(raw, 'logistics_refresh')).toMatch(/HttpOnly/i);
    expect(JSON.stringify(res.body)).not.toMatch(/eyJ/); // no JWT in the payload
    expect(res.body.user.username).toBe(ADMIN.username);
  });
});

describe('roles', () => {
  it('denies a logistics user the admin-only user list', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send(STAFF).expect(200);
    await request(app.getHttpServer()).get('/api/users').set('Cookie', jarFrom(login)).expect(403);
  });

  it('allows a logistics user to read reports', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send(STAFF).expect(200);
    await request(app.getHttpServer())
      .get('/api/reports/summary')
      .set('Cookie', jarFrom(login))
      .expect(200);
  });

  it('rejects an unknown field rather than ignoring it', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', jarFrom(login))
      .send({ username: 'e2e_tmp', displayName: 'Tmp', role: 'logistics', isSuperAdmin: true })
      .expect(400);
    expect(JSON.stringify(res.body.message)).toContain('isSuperAdmin');
  });
});

describe('refresh tokens', () => {
  it('rotates the token and revokes every session when a revoked one is reused', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);
    const firstRefresh = cookieValue(
      cookie(login.headers['set-cookie'] as unknown as string[], 'logistics_refresh'),
    );
    expect(firstRefresh).toBeDefined();

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', firstRefresh as string)
      .expect(200);
    const secondRefresh = cookieValue(
      cookie(refreshed.headers['set-cookie'] as unknown as string[], 'logistics_refresh'),
    );

    expect(secondRefresh).toBeDefined();
    expect(secondRefresh).not.toBe(firstRefresh);

    // Reusing the rotated-out token looks like theft.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', firstRefresh as string)
      .expect(401);

    // ...so the legitimate newer token is revoked as well.
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', secondRefresh as string)
      .expect(401);
  });
});

describe('deactivation', () => {
  it('invalidates an already-issued access token immediately', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send(STAFF).expect(200);
    const jar = jarFrom(login);

    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', jar).expect(200);

    await prisma.user.update({ where: { username: STAFF.username }, data: { isActive: false } });

    // The guard re-reads the user per request, so this does not wait for expiry.
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', jar).expect(401);

    await prisma.user.update({ where: { username: STAFF.username }, data: { isActive: true } });
  });

  it('refuses to leave the system without an active admin', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);
    const jar = jarFrom(login);
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', jar).expect(200);

    await request(app.getHttpServer())
      .patch(`/api/users/${me.body.user.id}`)
      .set('Cookie', jar)
      .send({ isActive: false })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/users/${me.body.user.id}`)
      .set('Cookie', jar)
      .send({ role: 'viewer' })
      .expect(400);
  });
});
