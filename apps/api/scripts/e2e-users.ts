/**
 * Creates (or removes) one throwaway account per role in the LOCAL dev database, for the browser e2e run.
 * Passwords are random, written to a mode-0600 file and never printed.
 *
 *   npx tsx scripts/e2e-users.ts create <credentials-file>
 *   npx tsx scripts/e2e-users.ts delete
 *
 * Refuses to run against anything but a localhost database.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import type { CompanyCode } from '../src/companies/company-code';
import { scriptPrisma } from '../src/tenancy/script-client';

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error('Refusing: DATABASE_URL is not a local database');

const prisma = scriptPrisma(url);

const ACCOUNTS: { username: string; role: Role; companyScope?: CompanyCode }[] = [
  { username: 'tmp_e2e_admin', role: 'admin' },
  { username: 'tmp_e2e_logistics', role: 'logistics' },
  { username: 'tmp_e2e_viewer', role: 'viewer' },
  { username: 'tmp_e2e_shlishut', role: 'SHLISHUT' },
  { username: 'tmp_e2e_samgad', role: 'SAMGAD' },
  { username: 'tmp_e2e_cmdr', role: 'COMPANY_CMDR', companyScope: 'A' },
];

async function main(): Promise<void> {
  const [action, file] = process.argv.slice(2);
  await prisma.user.deleteMany({ where: { username: { in: ACCOUNTS.map((a) => a.username) } } });
  if (action !== 'create') return;
  if (!file) throw new Error('usage: create <credentials-file>');
  const creds: Record<string, { username: string; password: string }> = {};
  for (const a of ACCOUNTS) {
    const password = `${randomBytes(9).toString('base64url')}-Aa1`;
    await prisma.user.create({
      data: {
        username: a.username,
        displayName: `בדיקה ${a.role}`,
        role: a.role,
        companyScope: a.companyScope ?? null,
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    creds[a.role] = { username: a.username, password };
  }
  writeFileSync(file, JSON.stringify(creds), { mode: 0o600 });
}

main().finally(() => prisma.$disconnect());
