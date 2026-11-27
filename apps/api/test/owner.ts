import { Client } from 'pg';

/**
 * Runs one statement as the database OWNER. The application connects as a restricted role that cannot
 * alter tables, so the specs that must switch an append-only trigger off to tidy up (the only way to delete
 * from those tables) do it through here, never through the app's own connection.
 */
export async function ownerExec(sql: string): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/** Rows from one query run as the database OWNER (fixtures and assertions the restricted role could not see). */
export async function ownerQuery<T extends Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return (await client.query<T>(sql, values)).rows;
  } finally {
    await client.end();
  }
}
