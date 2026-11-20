/**
 * הקצאות — the samgad's per-company split for a תקופת שרות, capped against an
 * item's בפועל (authorizedQty − yamahQty), not its מצבה.
 *
 * The property that matters: the sum of all five companies' quantities for
 * one item can never exceed what is physically on hand. There is no override
 * here — unlike the old battalion cap this replaced, בפועל is a hard physical
 * limit, not a planning target.
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

const ADMIN = { username: 'e2e_alloc_admin', password: 'e2e-alloc-admin-123' };
const SAMGAD = { username: 'e2e_alloc_samgad', password: 'e2e-alloc-samgad-123' };
const WEAPON = 'E2E רובה הקצאה';

let app: INestApplication;
let prisma: PrismaService;
let adminJar: string;
let samgadJar: string;
let weaponId: string;
let periodId: string;

async function cleanup(): Promise<void> {
  const items = await prisma.item.findMany({ where: { name: WEAPON }, select: { id: true } });
  const itemIds = items.map((i) => i.id);

  await prisma.companyAllocation.deleteMany({ where: { itemId: { in: itemIds } } });
  await prisma.servicePeriod.deleteMany({ where: { name: { startsWith: 'E2E-' } } });
  await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);

  await prisma.user.deleteMany({ where: { username: { in: [ADMIN.username, SAMGAD.username] } } });
  await prisma.user.create({
    data: {
      username: ADMIN.username,
      displayName: 'מנהל הבדיקה',
      role: 'admin',
      passwordHash: await bcrypt.hash(ADMIN.password, 12),
    },
  });
  await prisma.user.create({
    data: {
      username: SAMGAD.username,
      displayName: 'סמג"ד הבדיקה',
      role: 'SAMGAD',
      passwordHash: await bcrypt.hash(SAMGAD.password, 12),
    },
  });

  // The permission matrix is editable at runtime, so these tests do not rely
  // on whatever defaults a deployment happens to have seeded.
  await prisma.rolePermission.upsert({
    where: { role_key: { role: 'SAMGAD', key: 'allocations.battalion' } },
    update: { level: 'WRITE' },
    create: { role: 'SAMGAD', key: 'allocations.battalion', level: 'WRITE' },
  });

  const adminRes = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);
  adminJar = (adminRes.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
  const samgadRes = await request(app.getHttpServer()).post('/api/auth/login').send(SAMGAD).expect(200);
  samgadJar = (samgadRes.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
});

afterAll(async () => {
  await cleanup();
  await prisma?.user.updateMany({
    where: { username: { in: [ADMIN.username, SAMGAD.username] } },
    data: { isActive: false },
  });
  await app?.close();
});

beforeEach(async () => {
  await cleanup();
  // 10 מצבה, 4 at ימ״ח → 6 בפועל — the cap these tests assign against.
  const weapon = await prisma.item.create({
    data: { name: WEAPON, category: 'WEAPON', isSerialized: false, authorizedQty: 10, yamahQty: 4 },
  });
  weaponId = weapon.id;

  const period = await prisma.servicePeriod.create({
    data: { name: `E2E-${Date.now()}`, startsAt: new Date('2027-01-01'), endsAt: new Date('2027-01-14') },
  });
  periodId = period.id;
});

describe('הקצאות', () => {
  it('an item never added to the grid does not appear', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/service-periods/${periodId}/company-allocations`)
      .set('Cookie', samgadJar)
      .expect(200);

    expect(res.body.find((r: { itemId: string }) => r.itemId === weaponId)).toBeUndefined();
  });

  it('adding an item seeds every company at zero against the onHand cap', async () => {
    await request(app.getHttpServer())
      .post(`/api/service-periods/${periodId}/company-allocations/items`)
      .set('Cookie', samgadJar)
      .send({ itemId: weaponId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/service-periods/${periodId}/company-allocations`)
      .set('Cookie', samgadJar)
      .expect(200);

    const row = res.body.find((r: { itemId: string }) => r.itemId === weaponId);
    expect(row.onHand).toBe(6);
    expect(row.quantities).toEqual({ A: 0, B: 0, C: 0, SUPPORT: 0, HQ: 0 });
    expect(row.total).toBe(0);
  });

  it('the samgad can assign within בפועל', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/service-periods/${periodId}/company-allocations`)
      .set('Cookie', samgadJar)
      .send({ itemId: weaponId, company: 'A', quantity: 6 })
      .expect(201);

    expect(res.body.quantity).toBe(6);
  });

  it('refuses a single company exceeding בפועל', async () => {
    await request(app.getHttpServer())
      .post(`/api/service-periods/${periodId}/company-allocations`)
      .set('Cookie', samgadJar)
      .send({ itemId: weaponId, company: 'A', quantity: 7 })
      .expect(409);
  });

  it('refuses the sum across companies exceeding בפועל', async () => {
    await request(app.getHttpServer())
      .post(`/api/service-periods/${periodId}/company-allocations`)
      .set('Cookie', samgadJar)
      .send({ itemId: weaponId, company: 'A', quantity: 4 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/service-periods/${periodId}/company-allocations`)
      .set('Cookie', samgadJar)
      .send({ itemId: weaponId, company: 'B', quantity: 3 })
      .expect(409);
  });

  it('an admin is bound by the same onHand cap — no override exists', async () => {
    await request(app.getHttpServer())
      .post(`/api/service-periods/${periodId}/company-allocations`)
      .set('Cookie', adminJar)
      .send({ itemId: weaponId, company: 'A', quantity: 7 })
      .expect(409);
  });

  it('removes an item from the grid entirely', async () => {
    await request(app.getHttpServer())
      .post(`/api/service-periods/${periodId}/company-allocations/items`)
      .set('Cookie', samgadJar)
      .send({ itemId: weaponId })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/service-periods/${periodId}/company-allocations/items/${weaponId}`)
      .set('Cookie', samgadJar)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/service-periods/${periodId}/company-allocations`)
      .set('Cookie', samgadJar)
      .expect(200);

    expect(res.body.find((r: { itemId: string }) => r.itemId === weaponId)).toBeUndefined();
  });
});
