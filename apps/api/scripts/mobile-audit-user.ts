/**
 * Creates (or removes) a throwaway admin in the LOCAL dev database so the mobile layout audit can
 * sign in. The password is random, written to a file the audit reads, and never printed.
 *
 *   npx tsx scripts/mobile-audit-user.ts create <credentials-file>
 *   npx tsx scripts/mobile-audit-user.ts delete
 *
 * Refuses to run against anything but a localhost database.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { scriptPrisma } from '../src/tenancy/script-client';

const USERNAME = 'tmp_mobile_audit_admin';
const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error('Refusing: DATABASE_URL is not a local database');

const prisma = scriptPrisma(url);

async function main(): Promise<void> {
  const [action, file] = process.argv.slice(2);
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  if (action === 'create') {
    if (!file) throw new Error('usage: create <credentials-file>');
    const password = `${randomBytes(9).toString('base64url')}-Aa1`;
    await prisma.user.create({
      data: { username: USERNAME, displayName: 'בדיקת מובייל', role: 'admin', passwordHash: await bcrypt.hash(password, 12) },
    });
    writeFileSync(file, JSON.stringify({ username: USERNAME, password }), { mode: 0o600 });
  }
}

main().finally(() => prisma.$disconnect());
