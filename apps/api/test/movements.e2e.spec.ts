/**
 * דוח תנועות — which rows it lists, and what a date filter means.
 *
 * Two rules matter: bulk accessories (מחסנית, מק פורק…) never appear, and a
 * "from"/"to" date is a whole Israeli calendar day, so picking today for both
 * returns today's events instead of almost nothing.
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
import { ownerExec } from './owner';
import { israelToday } from '../src/common/israel-date';

const STAFF = { username: 'e2e_mov_staff', password: 'e2e-mov-staff-123' };
const WEAPON = 'E2E רובה תנועות';
const ACCESSORY = 'E2E מחסנית תנועות';
const SOLDIER = 'E2E-חייל-תנועות';

let app: INestApplication;
let prisma: PrismaService;
let jar: string;

async function cleanup(): Promise<void> {
  await ownerExec('ALTER TABLE movements DISABLE TRIGGER USER');
  await prisma.movement.deleteMany({ where: { soldierNameSnapshot: SOLDIER } });
  await ownerExec('ALTER TABLE movements ENABLE TRIGGER USER');
  await prisma.item.deleteMany({ where: { name: { in: [WEAPON, ACCESSORY] } } });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  // Same options as main.ts — implicit conversion is what turned the date strings into UTC Dates before.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  prisma = app.get(PrismaService);

  await cleanup();
  await prisma.user.deleteMany({ where: { username: STAFF.username } });
  await prisma.user.create({
    data: {
      username: STAFF.username,
      displayName: 'בודק תנועות',
      role: 'logistics',
      passwordHash: await bcrypt.hash(STAFF.password, 12),
    },
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(STAFF).expect(200);
  jar = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');

  const weapon = await prisma.item.create({
    data: { name: WEAPON, category: 'WEAPON', isSerialized: true, authorizedQty: 1 },
  });
  const accessory = await prisma.item.create({
    data: { name: ACCESSORY, category: 'ACCESSORY', isSerialized: false, authorizedQty: 5 },
  });
  for (const item of [weapon, accessory]) {
    await prisma.movement.create({
      data: {
        action: 'ISSUE',
        soldierNameSnapshot: SOLDIER,
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 1,
        performedByNameSnapshot: 'בודק תנועות',
      },
    });
  }
});

afterAll(async () => {
  await cleanup();
  await prisma?.user.deleteMany({ where: { username: STAFF.username } });
  await app?.close();
});

function list(query: Record<string, string>) {
  return request(app.getHttpServer()).get('/api/movements').query({ q: SOLDIER, ...query }).set('Cookie', jar);
}

describe('דוח תנועות', () => {
  it('lists a serialized weapon but never a bulk accessory', async () => {
    const res = await list({}).expect(200);
    const names = (res.body.rows as { itemName: string }[]).map((r) => r.itemName);
    expect(names).toEqual([WEAPON]);
    expect(res.body.total).toBe(1);
  });

  it('treats from = to = today as the whole of today', async () => {
    const today = israelToday();
    const res = await list({ from: today, to: today }).expect(200);
    expect((res.body.rows as unknown[]).length).toBe(1);
  });

  it("excludes events outside the chosen day", async () => {
    const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
    const res = await list({ from: tomorrow, to: tomorrow }).expect(200);
    expect((res.body.rows as unknown[]).length).toBe(0);
  });
});
