/**
 * The new way to get a password: an admin creates an account with NONE and hands over a one-time
 * link; the person opens it and chooses their own. Covers the link's life (single use, expiry,
 * replay), what a pending account can and cannot do, the reset path for a forgotten password or a
 * lost phone, the password rules, and the account event log.
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
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const ADMIN = { username: 'e2e_inv_admin', password: 'e2e-inv-admin-password-123' };
const NEWBIE = 'e2e_inv_newbie';
const GOOD = 'violet-anchor-pelican-drumbeat-47';

let app: INestApplication;
let prisma: PrismaService;
let adminJar: string;

const jarOf = (res: request.Response): string =>
  (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
const tokenOf = (url: string): string => url.split('/setup/')[1] as string;

async function createNewbie(role: string = 'logistics'): Promise<{ id: string; token: string; url: string }> {
  const res = await request(app.getHttpServer())
    .post('/api/users')
    .set('Cookie', adminJar)
    .send({ username: NEWBIE, displayName: 'דנה לוי', role })
    .expect(201);
  return { id: res.body.id, token: tokenOf(res.body.setup.url), url: res.body.setup.url };
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
  await prisma.user.deleteMany({ where: { username: { in: [ADMIN.username, NEWBIE] } } });
  await prisma.user.create({
    data: { username: ADMIN.username, displayName: 'מנהל', role: 'admin', passwordHash: await bcrypt.hash(ADMIN.password, 12) },
  });
  adminJar = jarOf(await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200));
});

afterAll(async () => {
  await prisma?.user.deleteMany({ where: { username: { in: [ADMIN.username, NEWBIE] } } });
  await app?.close();
});

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { username: NEWBIE } });
});

describe('creating an account', () => {
  it('gives the admin a setup link and no password, and stores no password', async () => {
    const { id, url } = await createNewbie();
    expect(url).toMatch(/\/setup\/[A-Za-z0-9_-]{40,}$/);
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user.passwordHash).toBeNull();
    expect(user.mustSetup).toBe(true);
  });

  it('stores only a hash of the link, never the link', async () => {
    const { token } = await createNewbie();
    const stored = await prisma.userInvite.findMany({ where: { user: { username: NEWBIE } } });
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('no longer accepts a password from the admin', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', adminJar)
      .send({ username: NEWBIE, displayName: 'x', role: 'viewer', password: 'chosen-by-admin-123' })
      .expect(400);
  });

  it('cannot log in before the link is used, with any password', async () => {
    await createNewbie();
    for (const password of ['whatever-at-all-123', GOOD]) {
      await request(app.getHttpServer()).post('/api/auth/login').send({ username: NEWBIE, password }).expect(401);
    }
  });
});

describe('the setup link', () => {
  it('shows who it is for', async () => {
    const { token } = await createNewbie();
    const res = await request(app.getHttpServer()).get(`/api/auth/setup/${token}`).expect(200);
    expect(res.body).toMatchObject({ username: NEWBIE, displayName: 'דנה לוי', kind: 'INVITE' });
  });

  it('lets the person choose a password, signs them in, and then works for login', async () => {
    const { token } = await createNewbie();
    const done = await request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password: GOOD }).expect(200);
    expect(done.body.user.username).toBe(NEWBIE);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', jarOf(done)).expect(200);

    await request(app.getHttpServer()).post('/api/auth/login').send({ username: NEWBIE, password: GOOD }).expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { username: NEWBIE } });
    expect(user.mustSetup).toBe(false);
  });

  it('works once: a second use, or a replay, is refused', async () => {
    const { token } = await createNewbie();
    await request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password: GOOD }).expect(200);
    await request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password: `${GOOD}-other` }).expect(404);
    await request(app.getHttpServer()).get(`/api/auth/setup/${token}`).expect(404);
  });

  it('only one of two simultaneous submissions succeeds', async () => {
    const { token } = await createNewbie();
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password: GOOD }),
      request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password: `${GOOD}-2nd` }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 404]);
  });

  it('answers the same for an unknown, expired and used link', async () => {
    const { token } = await createNewbie();
    await prisma.userInvite.updateMany({ where: { user: { username: NEWBIE } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(app.getHttpServer()).get(`/api/auth/setup/${token}`);
    const unknown = await request(app.getHttpServer()).get(`/api/auth/setup/${'x'.repeat(43)}`);
    const tiny = await request(app.getHttpServer()).get('/api/auth/setup/abc');
    expect([expired.status, unknown.status, tiny.status]).toEqual([404, 404, 404]);
    expect(expired.body.message).toBe(unknown.body.message);
    await request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password: GOOD }).expect(404);
  });

  it('a rejected password does not spend the link', async () => {
    const { token } = await createNewbie();
    await request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password: 'short' }).expect(400);
    await request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password: GOOD }).expect(200);
  });

  it('applies the password rules, including the person\'s own name', async () => {
    const { token } = await createNewbie();
    const refused = [
      'passwordpassword',
      '123456789012',
      `${NEWBIE}-and-some-more-words`,
      'x'.repeat(300),
    ];
    for (const password of refused) {
      await request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password }).expect(400);
    }
    // Built from the person's own (Hebrew) name:
    const named = await request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password: 'דנה-לוי-1990-!!!-xx' });
    expect(named.status).toBe(400);
  });

  it('a newer link cancels the older one', async () => {
    const first = await createNewbie();
    const again = await request(app.getHttpServer()).post(`/api/users/${first.id}/setup-link`).set('Cookie', adminJar).expect(201);
    await request(app.getHttpServer()).get(`/api/auth/setup/${first.token}`).expect(404);
    await request(app.getHttpServer()).get(`/api/auth/setup/${tokenOf(again.body.url)}`).expect(200);
  });
});

describe('forgotten password or lost device', () => {
  async function activeUser(): Promise<{ id: string; jar: string }> {
    const { id, token } = await createNewbie();
    const done = await request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password: GOOD }).expect(200);
    return { id, jar: jarOf(done) };
  }

  it('ends the person\'s sessions at once and blocks the old password until the link is used', async () => {
    const { id, jar } = await activeUser();
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', jar).expect(200);

    const link = await request(app.getHttpServer()).post(`/api/users/${id}/setup-link`).set('Cookie', adminJar).expect(201);

    // The session they had is gone immediately, and so is the old password.
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', jar).expect(401);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: NEWBIE, password: GOOD }).expect(401);

    const NEW = 'copper-lantern-meadow-whistle-82';
    await request(app.getHttpServer()).post(`/api/auth/setup/${tokenOf(link.body.url)}`).send({ password: NEW }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: NEWBIE, password: NEW }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: NEWBIE, password: GOOD }).expect(401);
  });

  it('is reported as a reset, not a new account', async () => {
    const { id } = await activeUser();
    const link = await request(app.getHttpServer()).post(`/api/users/${id}/setup-link`).set('Cookie', adminJar).expect(201);
    const res = await request(app.getHttpServer()).get(`/api/auth/setup/${tokenOf(link.body.url)}`).expect(200);
    expect(res.body.kind).toBe('RESET');
  });

  it('cannot be sent to yourself, to a deactivated account, or by a non-admin', async () => {
    const me = await prisma.user.findUniqueOrThrow({ where: { username: ADMIN.username } });
    await request(app.getHttpServer()).post(`/api/users/${me.id}/setup-link`).set('Cookie', adminJar).expect(400);

    const { id, jar } = await activeUser();
    await request(app.getHttpServer()).post(`/api/users/${id}/setup-link`).set('Cookie', jar).expect(403);

    await prisma.user.update({ where: { id }, data: { isActive: false } });
    await request(app.getHttpServer()).post(`/api/users/${id}/setup-link`).set('Cookie', adminJar).expect(400);
  });

  it('a link for a deactivated account no longer works', async () => {
    const { id, token } = await createNewbie();
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    await request(app.getHttpServer()).get(`/api/auth/setup/${token}`).expect(404);
  });
});

describe('account events', () => {
  it('records the creation, the link, its use, logins, a lock and an unlock — and never a secret', async () => {
    const { id, token } = await createNewbie();
    await request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password: GOOD }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: NEWBIE, password: GOOD }).expect(200);
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).post('/api/auth/login').send({ username: NEWBIE, password: 'wrong-password-123' }).expect(401);
    }
    await request(app.getHttpServer()).post(`/api/users/${id}/unlock`).set('Cookie', adminJar).expect(204);

    const events = await prisma.securityEvent.findMany({ where: { userId: id }, orderBy: { at: 'asc' } });
    const types = events.map((e) => e.type);
    for (const expected of ['USER_CREATED', 'INVITE_CREATED', 'INVITE_USED', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED']) {
      expect(types, expected).toContain(expected);
    }
    const dump = JSON.stringify(events);
    expect(dump).not.toContain(GOOD);
    expect(dump).not.toContain(token);

    const api = await request(app.getHttpServer()).get(`/api/users/${id}/security-events`).set('Cookie', adminJar).expect(200);
    expect(api.body.length).toBeGreaterThan(5);
  });

  it('does not store failed logins for a username that does not exist', async () => {
    const before = await prisma.securityEvent.count();
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'e2e_no_such_person', password: 'x-x-x-x-x-x-x-x' }).expect(401);
    expect(await prisma.securityEvent.count()).toBe(before);
  });

  it('only an admin can read them', async () => {
    const { id, token } = await createNewbie();
    const done = await request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password: GOOD }).expect(200);
    await request(app.getHttpServer()).get(`/api/users/${id}/security-events`).set('Cookie', jarOf(done)).expect(403);
  });
});

describe('changing your own password', () => {
  it('applies the same rules and keeps the session rule (old sessions end)', async () => {
    const { token } = await createNewbie();
    const done = await request(app.getHttpServer()).post(`/api/auth/setup/${token}`).send({ password: GOOD }).expect(200);
    const jar = jarOf(done);
    const change = (newPassword: string) =>
      request(app.getHttpServer()).post('/api/auth/change-password').set('Cookie', jar).send({ currentPassword: GOOD, newPassword });

    await change('short').expect(400);
    await change('passwordpassword').expect(400);
    await change(`${NEWBIE}-extra-words-here`).expect(400);
    await change('copper-lantern-meadow-whistle-82').expect(200);
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', jar).expect(401);
  });
});
