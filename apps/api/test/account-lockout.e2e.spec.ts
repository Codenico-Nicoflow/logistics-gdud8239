/**
 * Per-account lockout, unlock, and the immediate end of old sessions after a password change.
 * Lockout is per ACCOUNT, so it holds even when an attack is spread over many IPs.
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

const ADMIN = { username: 'e2e_lock_admin', password: 'e2e-lock-admin-password-123' };
const VICTIM = { username: 'e2e_lock_victim', password: 'e2e-lock-victim-password-123' };

let app: INestApplication;
let prisma: PrismaService;
let adminJar: string;

const jarOf = (res: request.Response): string =>
  (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
const login = (body: object) => request(app.getHttpServer()).post('/api/auth/login').send(body);

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.user.deleteMany({ where: { username: { in: [ADMIN.username, VICTIM.username] } } });
  await prisma.user.create({
    data: { username: ADMIN.username, displayName: 'מנהל', role: 'admin', passwordHash: await bcrypt.hash(ADMIN.password, 12) },
  });
  adminJar = jarOf(await login(ADMIN).expect(200));
});

afterAll(async () => {
  await prisma?.user.deleteMany({ where: { username: { in: [ADMIN.username, VICTIM.username] } } });
  await app?.close();
});

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { username: VICTIM.username } });
  await prisma.user.create({
    data: { username: VICTIM.username, displayName: 'קורבן', role: 'viewer', passwordHash: await bcrypt.hash(VICTIM.password, 12) },
  });
});

const wrong = () => login({ username: VICTIM.username, password: 'definitely-wrong-password' });

describe('account lockout', () => {
  it('locks after 5 wrong passwords, and a correct password no longer helps', async () => {
    for (let i = 0; i < 5; i++) await wrong().expect(401);
    const user = await prisma.user.findUniqueOrThrow({ where: { username: VICTIM.username } });
    expect(user.failedLoginCount).toBe(5);
    expect(user.lockedUntil && user.lockedUntil.getTime() > Date.now()).toBe(true);

    await login(VICTIM).expect(401);
  });

  it('answers identically for a locked account, a wrong password and an unknown user', async () => {
    for (let i = 0; i < 5; i++) await wrong().expect(401);
    const locked = await login(VICTIM);
    const wrongPw = await login({ username: ADMIN.username, password: 'nope-nope-nope-nope' });
    const unknown = await login({ username: 'e2e_no_such_user', password: 'nope-nope-nope-nope' });
    expect(locked.body.message).toBe(wrongPw.body.message);
    expect(locked.body.message).toBe(unknown.body.message);
  });

  it('an admin can unlock, after which the right password works and the counter is clear', async () => {
    for (let i = 0; i < 5; i++) await wrong().expect(401);
    const user = await prisma.user.findUniqueOrThrow({ where: { username: VICTIM.username } });
    await request(app.getHttpServer()).post(`/api/users/${user.id}/unlock`).set('Cookie', adminJar).expect(204);

    await login(VICTIM).expect(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { username: VICTIM.username } });
    expect(after.failedLoginCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
    expect(after.lastLoginAt).not.toBeNull();
  });

  it('a successful login before the threshold resets the counter', async () => {
    for (let i = 0; i < 3; i++) await wrong().expect(401);
    await login(VICTIM).expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { username: VICTIM.username } });
    expect(user.failedLoginCount).toBe(0);
  });

  it('a lock expires on its own', async () => {
    for (let i = 0; i < 5; i++) await wrong().expect(401);
    await prisma.user.update({ where: { username: VICTIM.username }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    await login(VICTIM).expect(200);
  });

  it('only an admin can unlock', async () => {
    const victimJar = jarOf(await login(VICTIM).expect(200));
    const user = await prisma.user.findUniqueOrThrow({ where: { username: VICTIM.username } });
    await request(app.getHttpServer()).post(`/api/users/${user.id}/unlock`).set('Cookie', victimJar).expect(403);
  });
});

describe('sessions end when the password changes', () => {
  it('refuses an access token issued before passwordChangedAt', async () => {
    const jar = jarOf(await login(VICTIM).expect(200));
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', jar).expect(200);

    await prisma.user.update({ where: { username: VICTIM.username }, data: { passwordChangedAt: new Date(Date.now() + 2000) } });
    await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', jar).expect(401);
  });
});
