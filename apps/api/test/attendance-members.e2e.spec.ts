/**
 * Removing a team member from ימי יציאה retires them going forward but must not
 * rewrite the past: a week in which they have entries still shows them.
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

const ADMIN = { username: 'e2e_att_admin', password: 'e2e-att-admin-123' };
const NICK = 'E2E-חבר-צוות';

let app: INestApplication;
let prisma: PrismaService;
let jar: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);
  await prisma.teamMember.deleteMany({ where: { nickname: NICK } });
  await prisma.user.deleteMany({ where: { username: ADMIN.username } });
  await prisma.user.create({
    data: {
      username: ADMIN.username,
      displayName: 'מנהל בדיקה',
      role: 'admin',
      passwordHash: await bcrypt.hash(ADMIN.password, 12),
    },
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(ADMIN).expect(200);
  jar = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
});

afterAll(async () => {
  await prisma?.teamMember.deleteMany({ where: { nickname: NICK } });
  await prisma?.user.deleteMany({ where: { username: ADMIN.username } });
  await app?.close();
});

const names = async (date: string): Promise<string[]> => {
  const res = await request(app.getHttpServer()).get(`/api/attendance/week?date=${date}`).set('Cookie', jar).expect(200);
  return res.body.rows.map((r: { nickname: string }) => r.nickname);
};

describe('removing a team member', () => {
  it('drops them from empty weeks but keeps them where they have entries', async () => {
    const member = (
      await request(app.getHttpServer())
        .post('/api/attendance/members')
        .set('Cookie', jar)
        .send({ nickname: NICK, gender: 'M' })
        .expect(201)
    ).body;
    await request(app.getHttpServer())
      .post('/api/attendance/cells')
      .set('Cookie', jar)
      .send({ cells: [{ teamMemberId: member.id, date: '2031-03-04', status: 'PRESENT' }] })
      .expect(201);

    expect(await names('2031-03-04')).toContain(NICK);
    expect(await names('2031-06-10')).toContain(NICK);

    await request(app.getHttpServer())
      .patch(`/api/attendance/members/${member.id}`)
      .set('Cookie', jar)
      .send({ isActive: false })
      .expect(200);

    expect(await names('2031-03-04')).toContain(NICK);
    expect(await names('2031-06-10')).not.toContain(NICK);

    const week = (await request(app.getHttpServer()).get('/api/attendance/week?date=2031-03-04').set('Cookie', jar)).body;
    expect(week.rows.find((r: { nickname: string }) => r.nickname === NICK).isActive).toBe(false);
  });
});
