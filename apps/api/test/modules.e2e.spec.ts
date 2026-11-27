/**
 * The optional parts of the product (חלוקה לפלוגות, ימי יציאה, ערכות). Each one switched off must be
 * refused by the server, quiet in the places that ask on every request (ניפוק), and absent from the
 * Excel backup, while the core keeps working. A battalion's switches never reach another battalion.
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
import { ExcelExportService } from '../src/excel/excel-export.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { runAsBattalion } from '../src/tenancy/tenant-context';
import { ownerExec, ownerQuery } from './owner';

const HOME = '00000000-0000-4000-8000-000000008239';
const OTHER = '00000000-0000-4000-8000-0000000b7a77';
const SUPER = { username: 'e2e_mod_super', password: 'e2e-mod-super-123' };
const PLAIN = { username: 'e2e_mod_admin', password: 'e2e-mod-admin-123' };
const STAFF = { username: 'e2e_mod_staff', password: 'e2e-mod-staff-123' };
const OTHER_SUPER = { username: 'e2e_mod_other', password: 'e2e-mod-other-123' };

let app: NestExpressApplication;
let prisma: PrismaService;
const jars: Record<string, string> = {};

async function login(u: { username: string; password: string }): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(u).expect(200);
  return (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
}
const http = (method: 'get' | 'put' | 'post', url: string, jar: string) =>
  request(app.getHttpServer())[method](`/api${url}`).set('Cookie', jar);
const setModule = (id: string, enabled: boolean, jar = jars.super as string) => http('put', `/modules/${id}`, jar).send({ enabled });
const resetModules = () => ownerExec(`DELETE FROM app_settings WHERE key LIKE 'module.%' AND battalion_id IN ('${HOME}','${OTHER}')`);

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  useBodyParsers(app);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(appValidationPipe());
  await app.init();
  prisma = app.get(PrismaService);

  await ownerExec(
    `INSERT INTO battalions (id, name, number) VALUES ('${OTHER}', 'גדוד 9999', '9999') ON CONFLICT (id) DO NOTHING`,
  );
  await ownerExec(`DELETE FROM users WHERE username LIKE 'e2e_mod_%'`);
  await resetModules();
  const hash = (p: string) => bcrypt.hashSync(p, 12);
  await prisma.user.create({
    data: { username: SUPER.username, displayName: 'סופר', role: 'admin', isSuperAdmin: true, battalionId: HOME, passwordHash: hash(SUPER.password) },
  });
  await prisma.user.create({
    data: { username: PLAIN.username, displayName: 'מנהל', role: 'admin', battalionId: HOME, passwordHash: hash(PLAIN.password) },
  });
  await prisma.user.create({
    data: { username: STAFF.username, displayName: 'לוגיסטיקה', role: 'logistics', battalionId: HOME, passwordHash: hash(STAFF.password) },
  });
  await runAsBattalion(OTHER, () =>
    prisma.user.create({
      data: { username: OTHER_SUPER.username, displayName: 'סופר אחר', role: 'admin', isSuperAdmin: true, battalionId: OTHER, passwordHash: hash(OTHER_SUPER.password) },
    }),
  );
  jars.super = await login(SUPER);
  jars.plain = await login(PLAIN);
  jars.staff = await login(STAFF);
  jars.other = await login(OTHER_SUPER);
});

afterAll(async () => {
  await resetModules();
  await ownerExec(`DELETE FROM users WHERE username LIKE 'e2e_mod_%'`);
  await app.close();
});

describe('modules', () => {
  it('start ON for a battalion that has never set them, and every role can read the state', async () => {
    const res = await http('get', '/modules', jars.staff as string).expect(200);
    expect(res.body).toEqual({ enabled: { companySplit: true, attendance: true, kits: true }, canChange: false });
    expect((await http('get', '/modules', jars.super as string)).body.canChange).toBe(true);
  });

  it('only a super admin can flip one, and an unknown module is refused', async () => {
    await setModule('attendance', false, jars.plain as string).expect(403);
    await setModule('attendance', false, jars.staff as string).expect(403);
    await setModule('nope', false).expect(400);
    await http('put', '/modules/attendance', jars.super as string).send({ enabled: 'maybe' }).expect(400);
    expect((await http('get', '/modules', jars.super as string)).body.enabled.attendance).toBe(true);
  });

  it('ימי יציאה off: the server refuses it and the weekly job skips it; on again restores it', async () => {
    await http('get', '/attendance/week', jars.staff as string).expect(200);
    const off = await setModule('attendance', false).expect(200);
    expect(off.body.enabled).toEqual({ companySplit: true, attendance: false, kits: true });
    await http('get', '/attendance/week', jars.staff as string).expect(403);
    await http('post', '/attendance/send-week', jars.super as string).send({}).expect(403);
    await setModule('attendance', true).expect(200);
    await http('get', '/attendance/week', jars.staff as string).expect(200);
  });

  it('ערכות off: the screen API is refused but ניפוק still gets an empty bundle, not an error', async () => {
    await http('get', '/item-kits', jars.super as string).expect(200);
    await setModule('kits', false).expect(200);
    await http('get', '/item-kits', jars.super as string).expect(403);
    const bundle = await http('get', '/issue-bundle?itemName=anything', jars.staff as string).expect(200);
    expect(bundle.body).toEqual([]);
    await setModule('kits', true).expect(200);
    await http('get', '/item-kits', jars.super as string).expect(200);
  });

  it('חלוקה לפלוגות off: allocation routes are refused, the entitlement is empty, the period itself still works', async () => {
    const periods = await http('get', '/service-periods', jars.staff as string).expect(200);
    await setModule('companySplit', false).expect(200);
    await http('get', '/service-periods', jars.staff as string).expect(200);
    await http('get', '/service-periods/active', jars.staff as string).expect(200);
    await http('get', `/service-periods/${periods.body[0]?.id ?? 'x'}/company-allocations`, jars.staff as string).expect(403);
    await http('get', `/service-periods/${periods.body[0]?.id ?? 'x'}/soldier-allocations`, jars.super as string).expect(403);
    const soldier = await prisma.soldier.findFirst({ select: { id: true } });
    if (soldier) {
      const res = await http('get', `/soldiers/${soldier.id}/entitlement`, jars.staff as string).expect(200);
      expect(res.body).toEqual([]);
    }
    await setModule('companySplit', true).expect(200);
  });

  it('the Excel backup leaves out the sheets of a module that is off', async () => {
    const sheets = async (): Promise<string[]> => (await app.get(ExcelExportService).build()).worksheets.map((w) => w.name);
    const all = await sheets();
    expect(all).toEqual(expect.arrayContaining(['ימי יציאה', 'חלוקה לפלוגות', 'חלוקה לפי חייל']));
    await setModule('attendance', false).expect(200);
    await setModule('companySplit', false).expect(200);
    const trimmed = await sheets();
    expect(trimmed).not.toContain('ימי יציאה');
    expect(trimmed).not.toContain('חלוקה לפלוגות');
    expect(trimmed).not.toContain('חלוקה לפי חייל');
    expect(trimmed).toContain('מסכם');
    await setModule('attendance', true).expect(200);
    await setModule('companySplit', true).expect(200);
  });

  it("one battalion's switch never reaches another, and each change is in the security log", async () => {
    await setModule('attendance', false).expect(200);
    expect((await http('get', '/modules', jars.other as string)).body.enabled.attendance).toBe(true);
    const events = await ownerQuery<{ detail: string }>(
      `SELECT detail FROM security_events WHERE type = 'MODULE_CHANGED' AND battalion_id = $1 ORDER BY at DESC LIMIT 1`,
      [HOME],
    );
    expect(events[0]?.detail).toBe('attendance=false');
    await setModule('attendance', true).expect(200);
  });

  it('a battalion created from now on starts with every module off', async () => {
    const number = '9997';
    await ownerExec(`DELETE FROM app_settings WHERE battalion_id IN (SELECT id FROM battalions WHERE number = '${number}')`);
    await ownerExec(`DELETE FROM form_counters WHERE battalion_id IN (SELECT id FROM battalions WHERE number = '${number}')`);
    await ownerExec(`DELETE FROM battalions WHERE number = '${number}'`);
    const [row] = await ownerQuery<{ id: string }>(`SELECT create_battalion('גדוד בדיקה', '${number}') AS id`);
    const settings = await ownerQuery<{ key: string; value: string }>(
      `SELECT key, value FROM app_settings WHERE battalion_id = $1 ORDER BY key`,
      [row?.id],
    );
    expect(settings).toEqual([
      { key: 'module.attendance', value: 'false' },
      { key: 'module.companySplit', value: 'false' },
      { key: 'module.kits', value: 'false' },
    ]);
    await ownerExec(`DELETE FROM app_settings WHERE battalion_id = '${row?.id}'`);
    await ownerExec(`DELETE FROM form_counters WHERE battalion_id = '${row?.id}'`);
    await ownerExec(`DELETE FROM battalions WHERE id = '${row?.id}'`);
  });
});
