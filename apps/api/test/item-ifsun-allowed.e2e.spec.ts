/**
 * Which items may go on the armory shelf is a per-item setting, not a fixed list of categories.
 */
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { appValidationPipe } from '../src/common/validation-pipe';
import { PrismaService } from '../src/prisma/prisma.service';

const ADMIN = { username: 'e2e_ifsunflag_admin', password: 'e2e-ifsunflag-admin-123' };
const PREFIX = 'E2EF ';

let app: INestApplication;
let prisma: PrismaService;
let jar: string;

const call = {
  get: (url: string) => request(app.getHttpServer()).get(`/api${url}`).set('Cookie', jar),
  post: (url: string, body: object) => request(app.getHttpServer()).post(`/api${url}`).set('Cookie', jar).send(body),
  patch: (url: string, body: object) => request(app.getHttpServer()).patch(`/api${url}`).set('Cookie', jar).send(body),
};

const newItem = (name: string, extra: object) =>
  call.post('/items', { name: PREFIX + name, category: 'GEAR', authorizedQty: 10, ...extra });

async function cleanup(): Promise<void> {
  const items = await prisma.item.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const ids = items.map((i) => i.id);
  await prisma.itemInstance.deleteMany({ where: { itemId: { in: ids } } });
  await prisma.item.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(appValidationPipe());
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.user.deleteMany({ where: { username: ADMIN.username } });
  await prisma.user.create({
    data: { username: ADMIN.username, displayName: 'מנהל אפסון', role: 'admin', passwordHash: await bcrypt.hash(ADMIN.password, 12) },
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);
  jar = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma?.user.deleteMany({ where: { username: ADMIN.username } });
  await app?.close();
});


describe('which items may be stored (אפסון)', () => {
  it('a new item starts storable only for weapons, optics and drones', async () => {
    const weapon = (await newItem('weapon', { category: 'WEAPON', isSerialized: false }).expect(201)).body;
    const sling = (await newItem('sling', { category: 'ACCESSORY', isSerialized: false }).expect(201)).body;
    expect(weapon.ifsunAllowed).toBe(true);
    expect(sling.ifsunAllowed).toBe(false);
  });

  it('the admin can allow an accessory like מתפסים, or forbid a weapon', async () => {
    const mag = (await newItem('clip', { category: 'ACCESSORY', isSerialized: false, ifsunAllowed: true }).expect(201)).body;
    expect(mag.ifsunAllowed).toBe(true);
    const rifle = (await newItem('rifle', { category: 'WEAPON', isSerialized: false }).expect(201)).body;
    const updated = (await call.patch(`/items/${rifle.id}`, { ifsunAllowed: false }).expect(200)).body;
    expect(updated.ifsunAllowed).toBe(false);
  });
});
