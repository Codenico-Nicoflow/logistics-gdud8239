/**
 * The battalion's own identity: its logo (stored in the database, PNG or JPEG only, admin-only to change)
 * and its name on what the app prints. Two battalions must never see each other's.
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
import { ownerExec } from './owner';

const HOME = '00000000-0000-4000-8000-000000008239';
const OTHER = '00000000-0000-4000-8000-0000000b7a77';
const ADMIN = { username: 'e2e_brand_admin', password: 'e2e-brand-admin-123' };
const STAFF = { username: 'e2e_brand_staff', password: 'e2e-brand-staff-123' };
const OTHER_ADMIN = { username: 'e2e_brand_other', password: 'e2e-brand-other-123' };

// The smallest real files: just the headers the service recognises.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('rest')]);

let app: NestExpressApplication;
let prisma: PrismaService;
const jars: Record<string, string> = {};

async function login(u: { username: string; password: string }): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(u).expect(200);
  return (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
}
const http = (method: 'get' | 'put' | 'delete', url: string, jar: string) =>
  request(app.getHttpServer())[method](`/api${url}`).set('Cookie', jar);

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
  const names = [ADMIN.username, STAFF.username, OTHER_ADMIN.username];
  await ownerExec(`DELETE FROM users WHERE username IN (${names.map((n) => `'${n}'`).join(',')})`);
  const hash = async (p: string) => bcrypt.hash(p, 12);
  await prisma.user.create({
    data: { username: ADMIN.username, displayName: 'מנהל', role: 'admin', battalionId: HOME, passwordHash: await hash(ADMIN.password) },
  });
  await prisma.user.create({
    data: { username: STAFF.username, displayName: 'לוגיסטיקה', role: 'logistics', battalionId: HOME, passwordHash: await hash(STAFF.password) },
  });
  await runAsBattalion(OTHER, () =>
    prisma.user.create({
      data: { username: OTHER_ADMIN.username, displayName: 'מנהל אחר', role: 'admin', battalionId: OTHER, passwordHash: bcryptSync(OTHER_ADMIN.password) },
    }),
  );
  jars.admin = await login(ADMIN);
  jars.staff = await login(STAFF);
  jars.other = await login(OTHER_ADMIN);
});

const bcryptSync = (p: string): string => bcrypt.hashSync(p, 12);

afterAll(async () => {
  await http('delete', '/battalion/logo', jars.admin as string);
  await ownerExec(`DELETE FROM users WHERE username LIKE 'e2e_brand_%'`);
  // The second battalion stays: its login left security events that point at it, and an empty battalion is harmless.
  await app.close();
});

describe('battalion identity', () => {
  it('tells every role its own battalion, with no logo to begin with', async () => {
    const res = await http('get', '/battalion', jars.staff as string).expect(200);
    expect(res.body).toMatchObject({ id: HOME, number: '8239', hasLogo: false });
    await http('get', '/battalion/logo', jars.staff as string).expect(404);
  });

  it('lets an admin upload a PNG, serves it back byte for byte, and bumps the version', async () => {
    const before = (await http('get', '/battalion', jars.admin as string).expect(200)).body.logoVersion as number;
    const put = await http('put', '/battalion/logo', jars.admin as string).set('Content-Type', 'image/png').send(PNG).expect(200);
    expect(put.body).toMatchObject({ hasLogo: true, logoVersion: before + 1 });
    const got = await http('get', '/battalion/logo', jars.staff as string).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(got.body as Buffer, PNG)).toBe(0);
  });

  it('accepts a JPEG and removes the logo again', async () => {
    await http('put', '/battalion/logo', jars.admin as string).set('Content-Type', 'image/jpeg').send(JPEG).expect(200);
    const gone = await http('delete', '/battalion/logo', jars.admin as string).expect(200);
    expect(gone.body.hasLogo).toBe(false);
  });

  it('refuses anything that is not really a PNG or JPEG, whatever it claims to be', async () => {
    await http('put', '/battalion/logo', jars.admin as string).set('Content-Type', 'image/png').send(Buffer.from('<svg onload=x>')).expect(400);
    await http('put', '/battalion/logo', jars.admin as string).set('Content-Type', 'image/svg+xml').send('<svg/>').expect(400);
  });

  it('refuses a file over the size limit with a readable message', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(520 * 1024)]);
    const res = await http('put', '/battalion/logo', jars.admin as string).set('Content-Type', 'image/png').send(big).expect(400);
    expect(JSON.stringify(res.body)).toContain('גדולה');
  });

  it('keeps the logo admin-only', async () => {
    await http('put', '/battalion/logo', jars.staff as string).set('Content-Type', 'image/png').send(PNG).expect(403);
    await http('delete', '/battalion/logo', jars.staff as string).expect(403);
  });

  it("never shows one battalion another's logo or name", async () => {
    await http('put', '/battalion/logo', jars.admin as string).set('Content-Type', 'image/png').send(PNG).expect(200);
    const other = await http('get', '/battalion', jars.other as string).expect(200);
    expect(other.body).toMatchObject({ id: OTHER, number: '9999', hasLogo: false });
    await http('get', '/battalion/logo', jars.other as string).expect(404);
  });
});
