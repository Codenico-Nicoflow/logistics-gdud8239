/**
 * Passkeys as the second sign-in step, against the real server verification (a software
 * authenticator signs with a real key). Covers: optional vs required, enrolling in the middle of a
 * sign-in, the step token's limits, replay/forgery/wrong-site/wrong-key refusals, several accounts on
 * one computer, resets that wipe passkeys, and removing devices.
 */
import 'dotenv/config';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { issueOperatorLink } from '../src/auth/operator-invite';
import { VirtualAuthenticator, type Tamper } from './helpers/virtual-authenticator';

const ORIGIN = 'https://passkeys.example';
const RP_ID = 'passkeys.example';
const PASSWORD = 'violet-anchor-pelican-drumbeat-47';
const ADMIN = { username: 'e2e_pk_admin', password: 'e2e-pk-admin-password-123' };
const USERS = ['e2e_pk_a', 'e2e_pk_b'] as const;

let app: INestApplication;
let prisma: PrismaService;
let adminJar: string;

const http = () => request(app.getHttpServer());
const jarOf = (res: request.Response): string =>
  ((res.headers['set-cookie'] ?? []) as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
const hasSession = (res: request.Response): boolean => jarOf(res).includes('logistics_access=');

beforeAll(async () => {
  // The origin and RP id are read per request, so setting them here (before any request) is enough.
  process.env.WEBAUTHN_ORIGIN = ORIGIN;
  process.env.WEBAUTHN_RP_ID = RP_ID;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);
  await prisma.user.deleteMany({ where: { username: { in: [ADMIN.username, ...USERS] } } });
  await prisma.user.create({
    data: { username: ADMIN.username, displayName: 'מנהל', role: 'admin', passwordHash: await bcrypt.hash(ADMIN.password, 12) },
  });
  adminJar = jarOf(await http().post('/api/auth/login').send(ADMIN).expect(200));
});

afterAll(async () => {
  delete process.env.WEBAUTHN_ORIGIN;
  delete process.env.WEBAUTHN_RP_ID;
  delete process.env.MFA_ENFORCED;
  await prisma?.user.deleteMany({ where: { username: { in: [ADMIN.username, ...USERS] } } });
  await app?.close();
});

beforeEach(async () => {
  delete process.env.MFA_ENFORCED;
  await prisma.user.deleteMany({ where: { username: { in: [...USERS] } } });
  const hash = await bcrypt.hash(PASSWORD, 12);
  for (const username of USERS) {
    await prisma.user.create({ data: { username, displayName: 'בודק', role: 'viewer', passwordHash: hash } });
  }
});
afterEach(() => {
  delete process.env.MFA_ENFORCED;
});

const passwordStep = (username: string) => http().post('/api/auth/login').send({ username, password: PASSWORD });

/** Adds a device to a signed-in account (the "my devices" path). */
async function addDevice(jar: string, name = 'הטלפון שלי'): Promise<VirtualAuthenticator> {
  const device = new VirtualAuthenticator(RP_ID, ORIGIN);
  const options = (await http().post('/api/auth/passkeys/register/options').set('Cookie', jar).expect(200)).body as PublicKeyCredentialCreationOptionsJSON;
  await http()
    .post('/api/auth/passkeys/register/verify')
    .set('Cookie', jar)
    .send({ response: device.register(options), deviceName: name })
    .expect(200);
  return device;
}

async function sessionFor(username: string): Promise<string> {
  return jarOf(await passwordStep(username).expect(200));
}

async function signInWithDevice(username: string, device: VirtualAuthenticator, tamper: Tamper = {}) {
  const step = (await passwordStep(username).expect(200)).body as { step: string; mfaToken: string };
  const options = (await http().post('/api/auth/webauthn/authenticate/options').send({ mfaToken: step.mfaToken }).expect(200))
    .body as PublicKeyCredentialRequestOptionsJSON;
  return http()
    .post('/api/auth/webauthn/authenticate/verify')
    .send({ mfaToken: step.mfaToken, response: device.authenticate(options, tamper) });
}

describe('passkeys are optional until enforced', () => {
  it('a person with no passkey signs in with the password alone while enforcement is off', async () => {
    const res = await passwordStep(USERS[0]).expect(200);
    expect(res.body.user.username).toBe(USERS[0]);
    expect(hasSession(res)).toBe(true);
  });

  it('once a device is added, the password alone is no longer enough', async () => {
    const jar = await sessionFor(USERS[0]);
    await addDevice(jar);
    const res = await passwordStep(USERS[0]).expect(200);
    expect(res.body).toMatchObject({ step: 'passkey' });
    expect(res.body.mfaToken).toEqual(expect.any(String));
    expect(res.body.user).toBeUndefined();
    expect(hasSession(res)).toBe(false);
  });

  it('signing in with the device completes the sign-in and opens a session', async () => {
    const device = await addDevice(await sessionFor(USERS[0]));
    const res = await signInWithDevice(USERS[0], device).then((r) => r);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(USERS[0]);
    await http().get('/api/auth/me').set('Cookie', jarOf(res)).expect(200);
  });

  it('the device\'s counter moves forward and last use is recorded', async () => {
    const device = await addDevice(await sessionFor(USERS[0]));
    await signInWithDevice(USERS[0], device).then((r) => expect(r.status).toBe(200));
    await signInWithDevice(USERS[0], device).then((r) => expect(r.status).toBe(200));
    const stored = await prisma.webauthnCredential.findFirstOrThrow({ where: { user: { username: USERS[0] } } });
    expect(stored.counter).toBe(2);
    expect(stored.lastUsedAt).not.toBeNull();
  });
});

describe('enforcement on', () => {
  beforeEach(() => {
    process.env.MFA_ENFORCED = 'true';
  });

  it('a person with no device must enrol one before getting any session', async () => {
    const res = await passwordStep(USERS[0]).expect(200);
    expect(res.body.step).toBe('enroll');
    expect(hasSession(res)).toBe(false);
  });

  it('enrolling in the middle of the sign-in opens the session, and the next sign-in asks for the device', async () => {
    const step = (await passwordStep(USERS[0]).expect(200)).body as { mfaToken: string };
    const device = new VirtualAuthenticator(RP_ID, ORIGIN);
    const options = (await http().post('/api/auth/webauthn/register/options').send({ mfaToken: step.mfaToken }).expect(200))
      .body as PublicKeyCredentialCreationOptionsJSON;
    const done = await http()
      .post('/api/auth/webauthn/register/verify')
      .send({ mfaToken: step.mfaToken, response: device.register(options), deviceName: 'מחשב המשרד' })
      .expect(200);
    expect(hasSession(done)).toBe(true);
    await http().get('/api/auth/me').set('Cookie', jarOf(done)).expect(200);

    const again = await passwordStep(USERS[0]).expect(200);
    expect(again.body.step).toBe('passkey');
  });

  it('a session opened before enforcement cannot be renewed by someone with no device', async () => {
    delete process.env.MFA_ENFORCED;
    const login = await passwordStep(USERS[0]).expect(200);
    const cookies = jarOf(login);
    process.env.MFA_ENFORCED = 'true';
    await http().post('/api/auth/refresh').set('Cookie', cookies).expect(401);
  });

  it('the last device cannot be removed while passkeys are required', async () => {
    delete process.env.MFA_ENFORCED;
    const jar = await sessionFor(USERS[0]);
    await addDevice(jar);
    process.env.MFA_ENFORCED = 'true';
    const list = (await http().get('/api/auth/passkeys').set('Cookie', jar).expect(200)).body as { id: string }[];
    await http().delete(`/api/auth/passkeys/${list[0]?.id}`).set('Cookie', jar).expect(409);
  });
});

describe('the step token', () => {
  it('is not a session: it cannot be used as an access token', async () => {
    const jar = await sessionFor(USERS[0]);
    await addDevice(jar);
    const step = (await passwordStep(USERS[0]).expect(200)).body as { mfaToken: string };
    await http().get('/api/auth/me').set('Authorization', `Bearer ${step.mfaToken}`).expect(401);
  });

  it('is not accepted when forged, or when it is really an access token', async () => {
    const jar = await sessionFor(USERS[0]);
    await addDevice(jar);
    const access = jar.split('; ').find((c) => c.startsWith('logistics_access='))?.split('=')[1] ?? '';
    for (const mfaToken of ['not-a-token', access, `${access}x`]) {
      await http().post('/api/auth/webauthn/authenticate/options').send({ mfaToken }).expect(401);
    }
  });

  it('dies if the account is reset between the password and the device', async () => {
    const jar = await sessionFor(USERS[0]);
    await addDevice(jar);
    const step = (await passwordStep(USERS[0]).expect(200)).body as { mfaToken: string };
    const user = await prisma.user.findUniqueOrThrow({ where: { username: USERS[0] } });
    await http().post(`/api/users/${user.id}/setup-link`).set('Cookie', adminJar).expect(201);
    await http().post('/api/auth/webauthn/authenticate/options').send({ mfaToken: step.mfaToken }).expect(401);
  });
});

describe('what the server refuses', () => {
  let device: VirtualAuthenticator;
  beforeEach(async () => {
    device = await addDevice(await sessionFor(USERS[0]));
  });

  it('a signature from another key', async () => {
    const res = await signInWithDevice(USERS[0], device, { wrongKey: true });
    expect(res.status).toBe(401);
    expect(hasSession(res)).toBe(false);
  });

  it('a response made for another site', async () => {
    const res = await signInWithDevice(USERS[0], device, { origin: 'https://evil.example' });
    expect(res.status).toBe(401);
  });

  it('a response for another relying-party id', async () => {
    const res = await signInWithDevice(USERS[0], device, { rpId: 'evil.example' });
    expect(res.status).toBe(401);
  });

  it('a device that did not verify the person (no fingerprint/PIN)', async () => {
    const res = await signInWithDevice(USERS[0], device, { flags: 0x01 });
    expect(res.status).toBe(401);
  });

  it('a replay of a response that already worked', async () => {
    const step = (await passwordStep(USERS[0]).expect(200)).body as { mfaToken: string };
    const options = (await http().post('/api/auth/webauthn/authenticate/options').send({ mfaToken: step.mfaToken }).expect(200))
      .body as PublicKeyCredentialRequestOptionsJSON;
    const response = device.authenticate(options);
    await http().post('/api/auth/webauthn/authenticate/verify').send({ mfaToken: step.mfaToken, response }).expect(200);
    await http().post('/api/auth/webauthn/authenticate/verify').send({ mfaToken: step.mfaToken, response }).expect(401);
  });

  it('a verify with no challenge issued', async () => {
    const step = (await passwordStep(USERS[0]).expect(200)).body as { mfaToken: string };
    const stale = { challenge: 'AAAA' } as PublicKeyCredentialRequestOptionsJSON;
    await http().post('/api/auth/webauthn/authenticate/verify').send({ mfaToken: step.mfaToken, response: device.authenticate(stale) }).expect(401);
  });

  it('a challenge can be tried only once, even after a failed attempt', async () => {
    const step = (await passwordStep(USERS[0]).expect(200)).body as { mfaToken: string };
    const options = (await http().post('/api/auth/webauthn/authenticate/options').send({ mfaToken: step.mfaToken }).expect(200))
      .body as PublicKeyCredentialRequestOptionsJSON;
    await http().post('/api/auth/webauthn/authenticate/verify').send({ mfaToken: step.mfaToken, response: device.authenticate(options, { wrongKey: true }) }).expect(401);
    await http().post('/api/auth/webauthn/authenticate/verify').send({ mfaToken: step.mfaToken, response: device.authenticate(options) }).expect(401);
  });

  it('an oversized or malformed response', async () => {
    const step = (await passwordStep(USERS[0]).expect(200)).body as { mfaToken: string };
    await http().post('/api/auth/webauthn/authenticate/verify').send({ mfaToken: step.mfaToken, response: { id: 'x'.repeat(40_000) } }).expect(400);
    await http().post('/api/auth/webauthn/authenticate/verify').send({ mfaToken: step.mfaToken, response: 'nope' }).expect(400);
  });

  it('registration for the wrong site or without user verification', async () => {
    const jar = await sessionFor(USERS[1]);
    for (const tamper of [{ origin: 'https://evil.example' }, { rpId: 'evil.example' }, { flags: 0x41 }]) {
      const fresh = new VirtualAuthenticator(RP_ID, ORIGIN);
      const options = (await http().post('/api/auth/passkeys/register/options').set('Cookie', jar).expect(200)).body as PublicKeyCredentialCreationOptionsJSON;
      await http().post('/api/auth/passkeys/register/verify').set('Cookie', jar).send({ response: fresh.register(options, tamper) }).expect(401);
    }
    expect(await prisma.webauthnCredential.count({ where: { user: { username: USERS[1] } } })).toBe(0);
  });
});

describe('several accounts on one computer', () => {
  it('offers each person only their own device, and refuses a device used on someone else\'s sign-in', async () => {
    const deviceA = await addDevice(await sessionFor(USERS[0]), 'טלפון א');
    const deviceB = await addDevice(await sessionFor(USERS[1]), 'טלפון ב');

    const stepA = (await passwordStep(USERS[0]).expect(200)).body as { mfaToken: string };
    const optionsA = (await http().post('/api/auth/webauthn/authenticate/options').send({ mfaToken: stepA.mfaToken }).expect(200))
      .body as PublicKeyCredentialRequestOptionsJSON;
    expect(optionsA.allowCredentials?.map((c) => c.id)).toEqual([deviceA.id]);

    // B's device presented on A's sign-in.
    const res = await http()
      .post('/api/auth/webauthn/authenticate/verify')
      .send({ mfaToken: stepA.mfaToken, response: deviceB.authenticate(optionsA) });
    expect(res.status).toBe(401);

    await signInWithDevice(USERS[1], deviceB).then((r) => expect(r.status).toBe(200));
  });
});

describe('a device already enrolled', () => {
  it('cannot be enrolled twice, and is excluded from the next registration', async () => {
    const jar = await sessionFor(USERS[0]);
    const device = await addDevice(jar);
    const options = (await http().post('/api/auth/passkeys/register/options').set('Cookie', jar).expect(200)).body as PublicKeyCredentialCreationOptionsJSON;
    expect(options.excludeCredentials?.map((c) => c.id)).toContain(device.id);
    await http().post('/api/auth/passkeys/register/verify').set('Cookie', jar).send({ response: device.register(options) }).expect(409);
  });
});

describe('managing your devices', () => {
  it('lists, adds and removes your own, never anyone else\'s', async () => {
    const jarA = await sessionFor(USERS[0]);
    const jarB = await sessionFor(USERS[1]);
    await addDevice(jarA, 'א-1');
    await addDevice(jarA, 'א-2');
    await addDevice(jarB, 'ב-1');

    const listA = (await http().get('/api/auth/passkeys').set('Cookie', jarA).expect(200)).body as { id: string; deviceName: string }[];
    expect(listA.map((d) => d.deviceName)).toEqual(['א-1', 'א-2']);
    expect(JSON.stringify(listA)).not.toContain('publicKey');

    const idOfB = ((await http().get('/api/auth/passkeys').set('Cookie', jarB).expect(200)).body as { id: string }[])[0]?.id;
    await http().delete(`/api/auth/passkeys/${idOfB}`).set('Cookie', jarA).expect(401);
    await http().delete(`/api/auth/passkeys/${listA[0]?.id}`).set('Cookie', jarA).expect(204);
    expect(((await http().get('/api/auth/passkeys').set('Cookie', jarA).expect(200)).body as unknown[]).length).toBe(1);
  });

  it('needs a session', async () => {
    await http().get('/api/auth/passkeys').expect(401);
    await http().post('/api/auth/passkeys/register/options').expect(401);
  });
});

describe('forgotten password or lost device', () => {
  it('a reset link wipes the passkeys; with enforcement on, finishing it asks for a new device', async () => {
    const jar = await sessionFor(USERS[0]);
    await addDevice(jar);
    const user = await prisma.user.findUniqueOrThrow({ where: { username: USERS[0] } });

    const link = (await http().post(`/api/users/${user.id}/setup-link`).set('Cookie', adminJar).expect(201)).body as { url: string };
    const token = link.url.split('/setup/')[1] as string;
    process.env.MFA_ENFORCED = 'true';
    const done = await http().post(`/api/auth/setup/${token}`).send({ password: 'copper-lantern-meadow-whistle-82' }).expect(200);

    expect(await prisma.webauthnCredential.count({ where: { userId: user.id } })).toBe(0);
    expect(done.body.step).toBe('enroll');
    expect(hasSession(done)).toBe(false);
  });

  it('a brand-new account, with enforcement on, enrols its first device before getting a session', async () => {
    process.env.MFA_ENFORCED = 'true';
    await prisma.user.deleteMany({ where: { username: USERS[0] } });
    const res = await http().post('/api/users').set('Cookie', adminJar).send({ username: USERS[0], displayName: 'חדש', role: 'viewer' }).expect(201);
    const token = (res.body.setup.url as string).split('/setup/')[1] as string;
    const done = await http().post(`/api/auth/setup/${token}`).send({ password: PASSWORD }).expect(200);
    expect(done.body.step).toBe('enroll');
    expect(hasSession(done)).toBe(false);
  });
});

describe('break-glass (no admin can sign in)', () => {
  it('the operator command issues a link that ends sessions and wipes passkeys, with no admin involved', async () => {
    const jar = await sessionFor(USERS[0]);
    await addDevice(jar);
    const link = await issueOperatorLink(prisma, USERS[0], ORIGIN);
    await http().get('/api/auth/me').set('Cookie', jar).expect(401);
    await passwordStep(USERS[0]).expect(401);

    expect(link.url.startsWith(`${ORIGIN}/setup/`)).toBe(true);
    const token = link.url.split('/setup/')[1] as string;
    const done = await http().post(`/api/auth/setup/${token}`).send({ password: 'copper-lantern-meadow-whistle-82' }).expect(200);
    expect(hasSession(done)).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { username: USERS[0] } });
    expect(await prisma.webauthnCredential.count({ where: { userId: user.id } })).toBe(0);
  });

  it('refuses an unknown username', async () => {
    await expect(issueOperatorLink(prisma, 'e2e_nobody_here', ORIGIN)).rejects.toThrow();
  });
});

describe('the account log', () => {
  it('records adding a device, signing in with it, a refused attempt and removing it — without secrets', async () => {
    const jar = await sessionFor(USERS[0]);
    const device = await addDevice(jar, 'הטלפון שלי');
    await signInWithDevice(USERS[0], device).then((r) => expect(r.status).toBe(200));
    await signInWithDevice(USERS[0], device, { wrongKey: true }).then((r) => expect(r.status).toBe(401));
    const list = (await http().get('/api/auth/passkeys').set('Cookie', jar).expect(200)).body as { id: string }[];
    await http().delete(`/api/auth/passkeys/${list[0]?.id}`).set('Cookie', jar).expect(204);

    const user = await prisma.user.findUniqueOrThrow({ where: { username: USERS[0] } });
    const events = await prisma.securityEvent.findMany({ where: { userId: user.id } });
    const details = events.map((e) => `${e.type}:${e.detail ?? ''}`);
    expect(details).toContain('PASSKEY_ADDED:הטלפון שלי');
    expect(details).toContain('LOGIN_SUCCESS:passkey');
    expect(details.some((d) => d.startsWith('LOGIN_FAILED:passkey'))).toBe(true);
    expect(details).toContain('PASSKEY_REMOVED:הטלפון שלי');
    expect(JSON.stringify(events)).not.toContain(PASSWORD);
  });
});
