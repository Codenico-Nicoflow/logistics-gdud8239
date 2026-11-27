/**
 * DEVELOPMENT ONLY. Creates a second, empty battalion — "5033 (בדיקה)" — with one admin, so the
 * multi-battalion behaviour (isolation, branding, the module switches) can be tried locally. It is the
 * "ready skeleton" a real new battalion starts from: no companies, no catalog, no soldiers.
 *
 *   SEED_ADMIN_PASSWORD=… npm run seed:test-battalion --workspace=apps/api
 *
 * Log in as `admin5033`. Refuses to run against anything that is not a local database.
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { scriptPrisma } from '../src/tenancy/script-client';

const TEST_BATTALION_ID = '00000000-0000-4000-8000-000000005033';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error('Refusing: DATABASE_URL is not a local database');
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error('Set SEED_ADMIN_PASSWORD to the password the test admin should get');

  const prisma = scriptPrisma(url, TEST_BATTALION_ID);
  try {
    await prisma.battalion.upsert({
      where: { id: TEST_BATTALION_ID },
      update: {},
      create: { id: TEST_BATTALION_ID, name: 'גדוד 5033 (בדיקה)', number: '5033' },
    });
    // A battalion's own counter for 1008 numbers starts with it.
    await prisma.formCounter.upsert({ where: { battalionId: TEST_BATTALION_ID }, update: {}, create: { battalionId: TEST_BATTALION_ID } });
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { username: 'admin5033' },
      update: {},
      create: { username: 'admin5033', displayName: 'מנהל 5033', role: 'admin', passwordHash, battalionId: TEST_BATTALION_ID },
    });
    console.log('גדוד 5033 (בדיקה) מוכן. התחברו כ-admin5033.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
