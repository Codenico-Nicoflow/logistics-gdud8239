/**
 * Turns the app's `DATABASE_URL` into something `pg_dump` (libpq) accepts.
 *
 * Two things in a Prisma/node-pg style URL break libpq, and a failed `pg_dump`
 * is what made the full backup silently unusable:
 *  - `?schema=…` is Prisma's own parameter; libpq errors on it. Passed back as `-n`.
 *  - `sslmode=no-verify` is a node-pg value (encrypt, skip certificate checks).
 *    libpq only knows disable/allow/prefer/require/verify-ca/verify-full and aborts
 *    with `invalid sslmode value`. `require` means exactly the same thing to libpq:
 *    TLS on, certificate not verified.
 */
const LIBPQ_SSLMODES = new Set(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']);

export function forPgDump(databaseUrl: string): { url: string; schema: string } {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema') ?? 'public';
  url.searchParams.delete('schema');

  const sslmode = url.searchParams.get('sslmode');
  if (sslmode !== null && !LIBPQ_SSLMODES.has(sslmode)) {
    url.searchParams.set('sslmode', 'require');
  }
  return { url: url.toString(), schema };
}
