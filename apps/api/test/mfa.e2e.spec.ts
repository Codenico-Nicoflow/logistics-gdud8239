/**
 * The authenticator-app second step, through the real HTTP stack against the dev database: enrolling,
 * signing in with a code, replay and lockout, backup codes, and the super-admin switches. Codes are
 * computed here with the same RFC 6238 routine a phone app uses.
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
import { codeFor, stepAt } from '../src/auth/totp';

const PASSWORD = 'e2e-mfa-password-long-123';
const SUPER = 'e2e_mfa_super';
const ADMIN = 'e2e_mfa_admin';
const STAFF = 'e2e_mfa_staff';
const USERS = [SUPER, ADMIN, STAFF];

let app: INestApplication;
let prisma: PrismaService;

const http = () => request(app.getHttpServer());
const jarFrom = (res: request.Response): string =>
  (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');

function loginRaw(username: string) {
  return http().post('/api/auth/login').send({ username, password: PASSWORD });
}

/** Password then the app step, the way a person does it. Returns the session cookie jar. */
async function signInWithApp(username: string, secret: string, offsetSteps = 0): Promise<string> {
  const first = await loginRaw(username).expect(200);
  expect(first.body.step).toBe('totp');
  const res = await http()
    .post('/api/auth/mfa/verify')
    .send({ mfaToken: first.body.mfaToken, code: codeFor(secret, stepAt(Date.now()) + offsetSteps) })
    .expect(200);
  return jarFrom(res);
}

/** Enrols a signed-in user through "setup" and returns the secret and backup codes. */
async function enrolSignedIn(username: string): Promise<{ secret: string; backupCodes: string[]; jar: string }> {
  const login = await loginRaw(username).expect(200);
  const jar = jarFrom(login);
  const start = await http().post('/api/auth/mfa/setup/start').set('Cookie', jar).expect(200);
  const secret = start.body.secret as string;
  const done = await http()
    .post('/api/auth/mfa/setup/confirm')
    .set('Cookie', jar)
    .send({ code: codeFor(secret, stepAt(Date.now())) })
    .expect(200);
  return { secret, backupCodes: done.body.backupCodes as string[], jar };
}

async function resetUsers(): Promise<void> {
  await prisma.user.deleteMany({ where: { username: { in: USERS } } });
  const hash = await bcrypt.hash(PASSWORD, 12);
  await prisma.user.create({ data: { username: SUPER, displayName: 'Super', role: 'admin', isSuperAdmin: true, passwordHash: hash } });
  await prisma.user.create({ data: { username: ADMIN, displayName: 'Admin', role: 'admin', passwordHash: hash } });
  await prisma.user.create({ data: { username: STAFF, displayName: 'Staff', role: 'logistics', passwordHash: hash } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);
});

beforeEach(async () => {
  await prisma.appSetting.deleteMany({ where: { key: 'mfa.enforced' } });
  await resetUsers();
});

afterAll(async () => {
  await prisma?.appSetting.deleteMany({ where: { key: 'mfa.enforced' } });
  await prisma?.user.deleteMany({ where: { username: { in: USERS } } });
  await app?.close();
});

describe('optional (the default)', () => {
  it('signs in with the password alone when the app is not set up', async () => {
    const res = await loginRaw(STAFF).expect(200);
    expect(res.body.user.username).toBe(STAFF);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('asks for a code once the person has set the app up, and gives no session before it', async () => {
    const { secret } = await enrolSignedIn(STAFF);
    const first = await loginRaw(STAFF).expect(200);
    expect(first.body.step).toBe('totp');
    expect(first.headers['set-cookie']).toBeUndefined();
    await http().get('/api/auth/me').expect(401);

    // Setting the app up used the current 30 s step, so the next code is the following step's.
    const ok = await http()
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: first.body.mfaToken, code: codeFor(secret, stepAt(Date.now()) + 1) })
      .expect(200);
    expect(ok.body.user.username).toBe(STAFF);
    await http().get('/api/auth/me').set('Cookie', jarFrom(ok)).expect(200);
  });

  it('does not store the secret in the clear', async () => {
    const { secret } = await enrolSignedIn(STAFF);
    const row = await prisma.userTotp.findFirstOrThrow({ where: { user: { username: STAFF } } });
    expect(row.secretEnc).not.toContain(secret);
  });

  it('does not count an unconfirmed secret as enrolled', async () => {
    const login = await loginRaw(STAFF).expect(200);
    await http().post('/api/auth/mfa/setup/start').set('Cookie', jarFrom(login)).expect(200);
    const again = await loginRaw(STAFF).expect(200);
    expect(again.body.user).toBeDefined(); // still straight in
  });

  it('refuses a wrong code and a code from a step too far away', async () => {
    const { secret } = await enrolSignedIn(STAFF);
    const first = await loginRaw(STAFF).expect(200);
    await http().post('/api/auth/mfa/verify').send({ mfaToken: first.body.mfaToken, code: '000000' }).expect(401);
    await http()
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: first.body.mfaToken, code: codeFor(secret, stepAt(Date.now()) + 5) })
      .expect(401);
  });

  it('accepts a code only once', async () => {
    const { secret } = await enrolSignedIn(STAFF);
    // Setup already consumed the current step; the next code is the following step's.
    await signInWithApp(STAFF, secret, 1);
    const again = await loginRaw(STAFF).expect(200);
    await http()
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: again.body.mfaToken, code: codeFor(secret, stepAt(Date.now()) + 1) })
      .expect(401);
  });

  it('a step token is not a session', async () => {
    await enrolSignedIn(STAFF);
    const first = await loginRaw(STAFF).expect(200);
    await http().get('/api/auth/me').set('Cookie', `logistics_access=${first.body.mfaToken}`).expect(401);
  });

  it('locks the account after repeated wrong codes, and re-entering the password does not refill the guesses', async () => {
    await enrolSignedIn(STAFF);
    const first = await loginRaw(STAFF).expect(200);
    for (let i = 0; i < 3; i++) {
      await http().post('/api/auth/mfa/verify').send({ mfaToken: first.body.mfaToken, code: '111111' }).expect(401);
    }
    // Logging in again must not reset the counter, or the guesses would never run out.
    await loginRaw(STAFF).expect(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { username: STAFF } });
    expect(row.failedLoginCount).toBe(3);

    for (let i = 0; i < 2; i++) {
      await http().post('/api/auth/mfa/verify').send({ mfaToken: first.body.mfaToken, code: '111111' }).expect(401);
    }
    const locked = await prisma.user.findUniqueOrThrow({ where: { username: STAFF } });
    expect(locked.lockedUntil).not.toBeNull();
    await loginRaw(STAFF).expect(401);
  });
});

describe('backup codes', () => {
  it('sign in once each, in any case or spacing, and then stop working', async () => {
    const { backupCodes } = await enrolSignedIn(STAFF);
    expect(backupCodes).toHaveLength(8);
    const code = backupCodes[0] as string;

    const first = await loginRaw(STAFF).expect(200);
    await http()
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: first.body.mfaToken, code: code.toLowerCase().replace('-', ' ') })
      .expect(200);

    const second = await loginRaw(STAFF).expect(200);
    await http().post('/api/auth/mfa/verify').send({ mfaToken: second.body.mfaToken, code }).expect(401);
  });

  it('are replaced, with the password, when regenerated', async () => {
    const { backupCodes, jar } = await enrolSignedIn(STAFF);
    await http().post('/api/auth/mfa/backup-codes').set('Cookie', jar).send({ password: 'wrong' }).expect(401);
    const res = await http().post('/api/auth/mfa/backup-codes').set('Cookie', jar).send({ password: PASSWORD }).expect(200);
    expect(res.body.backupCodes).toHaveLength(8);
    const first = await loginRaw(STAFF).expect(200);
    await http()
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: first.body.mfaToken, code: backupCodes[0] })
      .expect(401);
  });
});

describe('required for everyone', () => {
  /** The super-admin sets the app up, then requires it of everyone. Returns their secret. */
  async function enforceAsSuper(): Promise<string> {
    const { jar, secret } = await enrolSignedIn(SUPER);
    await http().put('/api/auth/mfa/enforcement').set('Cookie', jar).send({ enforced: true }).expect(204);
    return secret;
  }

  async function enrolMidSignIn(username: string): Promise<{ jar: string; secret: string }> {
    const first = await loginRaw(username).expect(200);
    expect(first.body.step).toBe('enroll');
    const start = await http().post('/api/auth/mfa/enrol/start').send({ mfaToken: first.body.mfaToken }).expect(200);
    const done = await http()
      .post('/api/auth/mfa/enrol/confirm')
      .send({ mfaToken: first.body.mfaToken, code: codeFor(start.body.secret, stepAt(Date.now())) })
      .expect(200);
    return { jar: jarFrom(done), secret: start.body.secret as string };
  }

  it('walks a person without the app through setting it up, then signs them in and gives backup codes', async () => {
    await enforceAsSuper();
    const first = await loginRaw(STAFF).expect(200);
    expect(first.body.step).toBe('enroll');
    expect(first.headers['set-cookie']).toBeUndefined();

    const start = await http().post('/api/auth/mfa/enrol/start').send({ mfaToken: first.body.mfaToken }).expect(200);
    expect(start.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(start.body.otpauthUrl).toContain(start.body.secret);

    await http().post('/api/auth/mfa/enrol/confirm').send({ mfaToken: first.body.mfaToken, code: '000000' }).expect(401);
    const done = await http()
      .post('/api/auth/mfa/enrol/confirm')
      .send({ mfaToken: first.body.mfaToken, code: codeFor(start.body.secret, stepAt(Date.now())) })
      .expect(200);
    expect(done.body.backupCodes).toHaveLength(8);
    await http().get('/api/auth/me').set('Cookie', jarFrom(done)).expect(200);
  });

  it('cannot be switched off by the person while it is required of them', async () => {
    await enforceAsSuper();
    const { jar } = await enrolMidSignIn(STAFF);
    await http().post('/api/auth/mfa/disable').set('Cookie', jar).send({ password: PASSWORD }).expect(403);
    const status = await http().get('/api/auth/mfa').set('Cookie', jar).expect(200);
    expect(status.body).toMatchObject({ enabled: true, enforced: true, exempt: false, canDisable: false });
  });

  it('lets a super-admin excuse one person, who then signs in with the password alone', async () => {
    const superSecret = await enforceAsSuper();
    const jar = await signInWithApp(SUPER, superSecret, 1);
    const staff = await prisma.user.findUniqueOrThrow({ where: { username: STAFF } });
    await http().patch(`/api/users/${staff.id}`).set('Cookie', jar).send({ mfaExempt: true }).expect(200);
    const res = await loginRaw(STAFF).expect(200);
    expect(res.body.user.username).toBe(STAFF);

    await http().patch(`/api/users/${staff.id}`).set('Cookie', jar).send({ mfaExempt: false }).expect(200);
    expect((await loginRaw(STAFF).expect(200)).body.step).toBe('enroll');
  });

  it('refuses to renew a session that predates the requirement for someone who has not set it up', async () => {
    const login = await loginRaw(STAFF).expect(200);
    const refresh = (login.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('logistics_refresh='))?.split(';')[0] as string;
    await enforceAsSuper();
    await http().post('/api/auth/refresh').set('Cookie', refresh).expect(401);
  });

  it('can be switched back to optional', async () => {
    const superSecret = await enforceAsSuper();
    const jar = await signInWithApp(SUPER, superSecret, 1);
    await http().put('/api/auth/mfa/enforcement').set('Cookie', jar).send({ enforced: false }).expect(204);
    expect((await loginRaw(STAFF).expect(200)).body.user).toBeDefined();
  });
});

describe('who may change the switches', () => {
  it('a regular admin cannot turn enforcement on or excuse anyone', async () => {
    const { jar } = await enrolSignedIn(ADMIN);
    await http().put('/api/auth/mfa/enforcement').set('Cookie', jar).send({ enforced: true }).expect(403);
    const staff = await prisma.user.findUniqueOrThrow({ where: { username: STAFF } });
    await http().patch(`/api/users/${staff.id}`).set('Cookie', jar).send({ mfaExempt: true }).expect(400);
  });

  it('a super-admin without the app themselves cannot require it of everyone', async () => {
    const login = await loginRaw(SUPER).expect(200);
    await http().put('/api/auth/mfa/enforcement').set('Cookie', jarFrom(login)).send({ enforced: true }).expect(409);
  });

  it('staff cannot reach the switches at all', async () => {
    const login = await loginRaw(STAFF).expect(200);
    await http().put('/api/auth/mfa/enforcement').set('Cookie', jarFrom(login)).send({ enforced: true }).expect(403);
    await http().get('/api/auth/mfa/overview').set('Cookie', jarFrom(login)).expect(403);
  });
});

describe('switching it off and resetting', () => {
  it('a person can switch it off in optional mode, with their password', async () => {
    const { jar } = await enrolSignedIn(STAFF);
    await http().post('/api/auth/mfa/disable').set('Cookie', jar).send({ password: 'wrong' }).expect(401);
    await http().post('/api/auth/mfa/disable').set('Cookie', jar).send({ password: PASSWORD }).expect(204);
    const res = await loginRaw(STAFF).expect(200);
    expect(res.body.user).toBeDefined();
  });

  it('an admin can wipe the app for someone who lost their phone, which also ends their sessions', async () => {
    const staff = await enrolSignedIn(STAFF);
    const admin = await enrolSignedIn(ADMIN);
    const row = await prisma.user.findUniqueOrThrow({ where: { username: STAFF } });
    await http().post(`/api/users/${row.id}/mfa-reset`).set('Cookie', admin.jar).expect(204);
    await http().get('/api/auth/me').set('Cookie', staff.jar).expect(401);
    const res = await loginRaw(STAFF).expect(200);
    expect(res.body.user).toBeDefined();
  });

  it('a setup link (forgotten password or lost phone) also wipes the app', async () => {
    await enrolSignedIn(STAFF);
    expect(await prisma.userTotp.count({ where: { user: { username: STAFF } } })).toBe(1);
    const admin = await enrolSignedIn(ADMIN);
    const row = await prisma.user.findUniqueOrThrow({ where: { username: STAFF } });
    const link = await http().post(`/api/users/${row.id}/setup-link`).set('Cookie', admin.jar).expect(201);
    const token = (link.body.url as string).split('/setup/')[1] as string;
    await http().post(`/api/auth/setup/${token}`).send({ password: 'a-brand-new-long-password-9' }).expect(200);
    expect(await prisma.userTotp.count({ where: { user: { username: STAFF } } })).toBe(0);
  });
});
