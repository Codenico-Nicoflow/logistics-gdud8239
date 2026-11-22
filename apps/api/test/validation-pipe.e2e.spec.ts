/**
 * Wrongly-typed JSON must be refused, not coerced into text.
 *
 * Found by the hostile-input probe: with implicit conversion on, an object or array in a string field was
 * turned into "[object Object]" / its first element before `@IsString` ever looked at it, and a soldier
 * with that name was created.
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

const STAFF = { username: 'e2e_pipe_staff', password: 'e2e-pipe-staff-123' };
let app: INestApplication;
let prisma: PrismaService;
let jar: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(appValidationPipe());
  await app.init();
  prisma = app.get(PrismaService);
  await prisma.user.deleteMany({ where: { username: STAFF.username } });
  await prisma.user.create({
    data: { username: STAFF.username, displayName: 'צינור', role: 'logistics', passwordHash: await bcrypt.hash(STAFF.password, 12) },
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').send(STAFF).expect(200);
  jar = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
});

afterAll(async () => {
  await prisma?.soldier.deleteMany({ where: { lastName: 'E2E-PIPE' } });
  await prisma?.user.deleteMany({ where: { username: STAFF.username } });
  await app?.close();
});

const create = (body: unknown) =>
  request(app.getHttpServer()).post('/api/soldiers').set('Cookie', jar).send(body as object);

describe('strict typing of request bodies', () => {
  it('refuses an object where a string is expected', async () => {
    await create({ firstName: { $ne: null }, lastName: 'E2E-PIPE', company: 'A' }).expect(400);
  });
  it('refuses an array where a string is expected', async () => {
    await create({ firstName: ['a'], lastName: 'E2E-PIPE', company: 'A' }).expect(400);
  });
  it('refuses a number where a string is expected', async () => {
    await create({ firstName: 12345, lastName: 'E2E-PIPE', company: 'A' }).expect(400);
  });
  it('still accepts a well-formed soldier', async () => {
    await create({ firstName: 'דנה', lastName: 'E2E-PIPE', company: 'A' }).expect(201);
  });
  it('still reads numbers and booleans from a query string', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/soldiers?take=1&incompleteOnly=false&includeInactive=true')
      .set('Cookie', jar)
      .expect(200);
    expect(res.body.rows.length).toBeLessThanOrEqual(1);
  });
});
