/**
 * Gives the restricted application role its password — once per database, and again to rotate it.
 *
 *   DATABASE_URL=<owner url> APP_DATABASE_URL=postgresql://logistics_app:<password>@host/db npm run db:app-role
 *
 * The migration creates the role `logistics_app` (not the owner, no BYPASSRLS) without a password, because
 * a password does not belong in a migration. This reads the password out of APP_DATABASE_URL so the two
 * can never disagree, and sets it with the owner connection.
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main(): Promise<void> {
  const owner = process.env.DATABASE_URL;
  const app = process.env.APP_DATABASE_URL;
  if (!owner || !app) throw new Error('Set DATABASE_URL (the owner) and APP_DATABASE_URL (the restricted role, with the password to set)');

  const target = new URL(app);
  const role = decodeURIComponent(target.username);
  const password = decodeURIComponent(target.password);
  if (role !== 'logistics_app') throw new Error(`APP_DATABASE_URL must use the role logistics_app, not "${role}"`);
  if (!password) throw new Error('APP_DATABASE_URL has no password in it');

  const client = new Client({ connectionString: owner });
  await client.connect();
  try {
    // format() quotes the password as a literal, so no character in it can end the statement.
    const { rows } = await client.query<{ sql: string }>('SELECT format($1, $2::text, $3::text) AS sql', ['ALTER ROLE %I PASSWORD %L', role, password]);
    await client.query(rows[0]?.sql ?? '');
    console.log(`Password set for role ${role}.`);
  } finally {
    await client.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
