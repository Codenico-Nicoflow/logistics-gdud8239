/**
 * Removing a team member from ימי יציאה is a real delete: the person and every
 * entry of theirs go, and the nickname is free to be added again.
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
import { ExcelExportService } from '../src/excel/excel-export.service';
import { israelToday } from '../src/common/israel-date';

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
  await prisma.teamMember.deleteMany({ where: { nickname: { startsWith: NICK } } });
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
  await prisma?.teamMember.deleteMany({ where: { nickname: { startsWith: NICK } } });
  await prisma?.user.deleteMany({ where: { username: ADMIN.username } });
  await app?.close();
});

const names = async (date: string): Promise<string[]> => {
  const res = await request(app.getHttpServer()).get(`/api/attendance/week?date=${date}`).set('Cookie', jar).expect(200);
  return res.body.rows.map((r: { nickname: string }) => r.nickname);
};

describe('deleting a team member', () => {
  const add = (nickname: string) =>
    request(app.getHttpServer()).post('/api/attendance/members').set('Cookie', jar).send({ nickname, gender: 'M' });
  const fill = (teamMemberId: string, date: string, status = 'PRESENT') =>
    request(app.getHttpServer())
      .post('/api/attendance/cells')
      .set('Cookie', jar)
      .send({ cells: [{ teamMemberId, date, status }] })
      .expect(201);

  it('removes them and all their entries from every week, and frees the name', async () => {
    const member = (await add(NICK).expect(201)).body;
    await fill(member.id, '2031-03-04');
    expect(await names('2031-03-04')).toContain(NICK);

    await request(app.getHttpServer()).delete(`/api/attendance/members/${member.id}`).set('Cookie', jar).expect(200);

    expect(await names('2031-03-04')).not.toContain(NICK);
    expect(await names('2031-06-10')).not.toContain(NICK);
    expect(await prisma.attendance.count({ where: { teamMemberId: member.id } })).toBe(0);

    // The name can be used again, and the new person starts clean.
    const again = (await add(NICK).expect(201)).body;
    expect(again.id).not.toBe(member.id);
    expect(await names('2031-03-04')).toContain(NICK);
  });

  it('adding a name left behind by the old deactivate-only removal clears the leftover', async () => {
    const legacy = (await add(`${NICK}-ישן`).expect(201)).body;
    await fill(legacy.id, '2031-03-04');
    await request(app.getHttpServer())
      .patch(`/api/attendance/members/${legacy.id}`)
      .set('Cookie', jar)
      .send({ isActive: false })
      .expect(200);

    await add(`${NICK}-ישן`).expect(201);
    expect(await prisma.teamMember.count({ where: { nickname: `${NICK}-ישן` } })).toBe(1);
    expect(await prisma.attendance.count({ where: { teamMemberId: legacy.id } })).toBe(0);
  });

  it('still refuses a name that is in use', async () => {
    await add(`${NICK}-כפול`).expect(201);
    await add(`${NICK}-כפול`).expect(409);
  });

  it('is in the Excel backup, and gone from it once deleted', async () => {
    const member = (await add(`${NICK}-אקסל`).expect(201)).body;
    await fill(member.id, israelToday(), 'GIMELIM');

    const cellsOf = async (): Promise<string[]> => {
      const wb = await app.get(ExcelExportService).build();
      const out: string[] = [];
      wb.getWorksheet('ימי יציאה')?.eachRow((row) => row.eachCell((c) => out.push(String(c.value ?? ''))));
      return out;
    };
    const before = await cellsOf();
    expect(before).toContain(`${NICK}-אקסל`);
    expect(before).toContain('גימלים');

    await request(app.getHttpServer()).delete(`/api/attendance/members/${member.id}`).set('Cookie', jar).expect(200);
    expect(await cellsOf()).not.toContain(`${NICK}-אקסל`);
  });

  it('is admin only', async () => {
    const member = (await add(`${NICK}-הרשאה`).expect(201)).body;
    await request(app.getHttpServer()).delete(`/api/attendance/members/${member.id}`).expect(401);
  });
});
