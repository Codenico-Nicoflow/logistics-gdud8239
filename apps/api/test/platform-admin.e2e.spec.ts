/**
 * The platform operator: creating battalions and working inside them. What must hold: only the platform
 * admin may do any of it; a new battalion starts empty with one admin who sets their own password; acting as
 * a battalion shows and changes only that battalion, under the operator's own name, through a hidden
 * stand-in account nobody can sign in with; and the session dies the moment the operator loses access.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { useBodyParsers } from '../src/common/body-parsers';
import { appValidationPipe } from '../src/common/validation-pipe';
import { PrismaService } from '../src/prisma/prisma.service';
import { runAsBattalion } from '../src/tenancy/tenant-context';
import { ownerExec, ownerQuery } from './owner';

const HOME = '00000000-0000-4000-8000-000000008239';
const NUMBER = '7777';
const PLATFORM = { username: 'e2e_plat_owner', password: 'e2e-plat-owner-123' };
const ADMIN = { username: 'e2e_plat_admin', password: 'e2e-plat-admin-123' };
const NEW_ADMIN = { username: 'e2e_plat_admin7777', password: 'a-long-password-for-7777' };

let app: NestExpressApplication;
let prisma: PrismaService;
let platformId = '';
const jars: Record<string, string> = {};
let newBattalionId = '';
let firstToken = '';

const cookiesOf = (res: request.Response): string =>
  (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');

async function login(u: { username: string; password: string }): Promise<string> {
  return cookiesOf(await request(app.getHttpServer()).post('/api/auth/login').send(u).expect(200));
}
const http = (method: 'get' | 'post' | 'patch', url: string, jar: string) =>
  request(app.getHttpServer())[method](`/api${url}`).set('Cookie', jar);

async function wipeBattalion(): Promise<void> {
  const ids = await ownerQuery<{ id: string }>(`SELECT id FROM battalions WHERE number = '${NUMBER}'`);
  for (const { id } of ids) {
    await ownerExec(`DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE battalion_id = '${id}')`);
    await ownerExec(`DELETE FROM user_invites WHERE user_id IN (SELECT id FROM users WHERE battalion_id = '${id}')`);
    await ownerExec(`DELETE FROM security_events WHERE battalion_id = '${id}'`);
    await ownerExec(`DELETE FROM companies WHERE battalion_id = '${id}'`);
    await ownerExec(`DELETE FROM users WHERE battalion_id = '${id}'`);
    await ownerExec(`DELETE FROM form_counters WHERE battalion_id = '${id}'`);
    await ownerExec(`DELETE FROM battalions WHERE id = '${id}'`);
  }
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  useBodyParsers(app);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(appValidationPipe());
  await app.init();
  prisma = app.get(PrismaService);

  await wipeBattalion();
  await ownerExec(`DELETE FROM users WHERE username IN ('${PLATFORM.username}','${ADMIN.username}')`);
  const hash = (p: string) => bcrypt.hashSync(p, 12);
  const owner = await prisma.user.create({
    data: { username: PLATFORM.username, displayName: 'מפעיל', role: 'admin', battalionId: HOME, isPlatformAdmin: true, passwordHash: hash(PLATFORM.password) },
  });
  platformId = owner.id;
  await prisma.user.create({
    data: { username: ADMIN.username, displayName: 'מנהל רגיל', role: 'admin', battalionId: HOME, passwordHash: hash(ADMIN.password) },
  });
  jars.platform = await login(PLATFORM);
  jars.admin = await login(ADMIN);
});

afterAll(async () => {
  await wipeBattalion();
  await ownerExec(`DELETE FROM users WHERE username IN ('${PLATFORM.username}','${ADMIN.username}')`);
  await app.close();
});

describe('who may use it', () => {
  it("refuses a battalion's own admin everything", async () => {
    await http('get', '/platform/battalions', jars.admin as string).expect(403);
    await http('post', '/platform/battalions', jars.admin as string)
      .send({ name: 'גדוד', number: NUMBER, adminUsername: 'x_admin', adminDisplayName: 'מנהל' })
      .expect(403);
    await http('post', '/platform/act-as', jars.admin as string).send({ battalionId: HOME }).expect(403);
  });
});

describe('creating a battalion', () => {
  it('makes an empty battalion with one admin who has not chosen a password yet', async () => {
    const res = await http('post', '/platform/battalions', jars.platform as string)
      .send({ name: 'גדוד 7777', number: NUMBER, adminUsername: NEW_ADMIN.username, adminDisplayName: 'מנהל שבע' })
      .expect(201);
    newBattalionId = res.body.battalion.id as string;
    expect(res.body.battalion).toMatchObject({ number: NUMBER, userCount: 1, adminCount: 0 });
    expect(res.body.setup.url).toContain('/setup/');
    firstToken = (res.body.setup.url as string).split('/setup/')[1] as string;
    // No password exists, so nobody (including us) can sign in as this admin yet.
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: NEW_ADMIN.username, password: 'anything-at-all-12' }).expect(401);
  });

  it('has its own 1008 counter and nothing else', async () => {
    const counters = await ownerQuery<{ next_form_no: number }>(`SELECT next_form_no FROM form_counters WHERE battalion_id = '${newBattalionId}'`);
    expect(counters).toEqual([{ next_form_no: 1 }]);
    const companies = await ownerQuery<{ n: string }>(`SELECT count(*) AS n FROM companies WHERE battalion_id = '${newBattalionId}'`);
    expect(Number(companies[0]?.n)).toBe(0);
  });

  it('refuses a number or an admin username that is already taken, and leaves nothing half made', async () => {
    const before = (await http('get', '/platform/battalions', jars.platform as string)).body.length as number;
    await http('post', '/platform/battalions', jars.platform as string)
      .send({ name: 'עוד', number: NUMBER, adminUsername: 'e2e_plat_other', adminDisplayName: 'מנהל' })
      .expect(409);
    await http('post', '/platform/battalions', jars.platform as string)
      .send({ name: 'עוד', number: '7778', adminUsername: PLATFORM.username, adminDisplayName: 'מנהל' })
      .expect(409);
    const after = (await http('get', '/platform/battalions', jars.platform as string)).body.length as number;
    expect(after).toBe(before);
  });

  it('rejects a number that is not 2 to 6 digits', async () => {
    await http('post', '/platform/battalions', jars.platform as string)
      .send({ name: 'גדוד', number: '12ab', adminUsername: 'e2e_plat_bad', adminDisplayName: 'מנהל' })
      .expect(400);
  });

  it('lets the first admin choose a password and then sees an empty battalion of their own', async () => {
    const done = await request(app.getHttpServer()).post(`/api/auth/setup/${firstToken}`).send({ password: NEW_ADMIN.password }).expect(200);
    const jar = cookiesOf(done);
    expect((await http('get', '/battalion', jar).expect(200)).body).toMatchObject({ id: newBattalionId, number: NUMBER });
    expect((await http('get', '/companies', jar).expect(200)).body).toEqual([]);
    jars.newAdmin = jar;
  });

  it('can add another admin later, for a battalion that lost its only one', async () => {
    const res = await http('post', `/platform/battalions/${newBattalionId}/admin`, jars.platform as string)
      .send({ adminUsername: 'e2e_plat_second', adminDisplayName: 'מנהל נוסף' })
      .expect(201);
    expect(res.body.setup.url).toContain('/setup/');
  });
});

describe('acting as a battalion', () => {
  it('shows and changes only that battalion, under a stand-in account', async () => {
    const res = await http('post', '/platform/act-as', jars.platform as string).send({ battalionId: newBattalionId }).expect(200);
    expect(res.body.user).toMatchObject({ battalionId: newBattalionId, homeBattalionId: HOME, actorId: platformId, isPlatformAdmin: true });
    jars.acting = cookiesOf(res);

    expect((await http('get', '/battalion', jars.acting).expect(200)).body.number).toBe(NUMBER);
    const created = await http('post', '/companies', jars.acting).send({ name: 'פלוגת בדיקה' }).expect(201);
    expect(created.body.name).toBe('פלוגת בדיקה');

    // The battalion's own admin sees what the operator did there; the home battalion never does.
    expect((await http('get', '/companies', jars.newAdmin as string).expect(200)).body.map((c: { name: string }) => c.name)).toContain('פלוגת בדיקה');
    expect((await http('get', '/companies', jars.platform as string).expect(200)).body.map((c: { name: string }) => c.name)).not.toContain('פלוגת בדיקה');
  });

  it('keeps the stand-in out of the battalion’s user list, and out of its admin count', async () => {
    const users = (await http('get', '/users', jars.newAdmin as string).expect(200)).body as { username: string }[];
    expect(users.map((u) => u.username).sort()).toEqual([NEW_ADMIN.username, 'e2e_plat_second'].sort());
    // The one real admin cannot be demoted just because the operator's stand-in is also an admin.
    const me = users.find((u) => u.username === NEW_ADMIN.username) as unknown as { id: string };
    const second = users.find((u) => u.username === 'e2e_plat_second') as unknown as { id: string };
    await http('patch', `/users/${second.id}`, jars.newAdmin as string).send({ isActive: false }).expect(200);
    // With the second admin off, `me` is the only real admin. The stand-in is an admin too, but must not count.
    await http('patch', `/users/${me.id}`, jars.acting as string).send({ isActive: false }).expect(400);
  });

  it('cannot be signed into with a password', async () => {
    const [row] = await ownerQuery<{ username: string }>(`SELECT username FROM users WHERE acts_for_id = '${platformId}' AND battalion_id = '${newBattalionId}'`);
    expect(row?.username).toBe(`actor:${platformId}:${NUMBER}`);
    await request(app.getHttpServer()).post('/api/auth/login').send({ username: row?.username, password: 'whatever-123456' }).expect(401);
  });

  it('records the switch in that battalion’s audit trail under the real person', async () => {
    const events = await runAsBattalion(newBattalionId, () => prisma.securityEvent.findMany({ where: { type: 'ACT_AS' } }));
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.actorUserId).toBe(platformId);
  });

  it('switches back to the real account', async () => {
    const back = await http('post', '/platform/act-as', jars.acting as string).send({ battalionId: HOME }).expect(200);
    expect(back.body.user).toMatchObject({ battalionId: HOME, actorId: null, id: platformId });
    const jar = cookiesOf(back);
    expect((await http('get', '/battalion', jar).expect(200)).body.number).toBe('8239');
  });

  it('refuses a battalion that does not exist', async () => {
    await http('post', '/platform/act-as', jars.platform as string).send({ battalionId: '00000000-0000-4000-8000-00000000dead' }).expect(404);
  });

  it('ends the stand-in session the moment the operator loses platform access', async () => {
    await http('get', '/battalion', jars.acting as string).expect(200);
    await ownerExec(`UPDATE users SET is_platform_admin = false WHERE id = '${platformId}'`);
    try {
      await http('get', '/battalion', jars.acting as string).expect(401);
    } finally {
      await ownerExec(`UPDATE users SET is_platform_admin = true WHERE id = '${platformId}'`);
    }
  });
});

describe('renaming', () => {
  it('changes the name and keeps the number', async () => {
    const res = await http('patch', `/platform/battalions/${newBattalionId}`, jars.platform as string).send({ name: 'גדוד שבע' }).expect(200);
    expect(res.body).toMatchObject({ name: 'גדוד שבע', number: NUMBER });
  });
});
