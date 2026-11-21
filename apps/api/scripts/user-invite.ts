/**
 * Break-glass: prints a fresh one-time setup link for a user.
 *
 *   DATABASE_URL=… WEB_ORIGIN=https://… npm run user:invite -- <username>
 *
 * For the day no admin can sign in. Anyone who can run this already holds the database credentials,
 * so it asks nothing more. It leaves a trail: an INVITE_CREATED event marked "operator".
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { issueOperatorLink } from '../src/auth/operator-invite';

async function main(): Promise<void> {
  const username = process.argv[2];
  if (!username) {
    console.error('usage: npm run user:invite -- <username>');
    process.exit(2);
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const webOrigin = process.env.WEB_ORIGIN;
  if (!webOrigin) throw new Error('WEB_ORIGIN is not set (the link needs the address people open)');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const link = await issueOperatorLink(prisma, username, webOrigin);
    console.log(`\nSetup link for ${username} (valid until ${link.expiresAt.toISOString()}):\n\n  ${link.url}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
