# fix: full DB backup failed on production (`invalid sslmode value: "no-verify"`)

On Render, `POST /api/db-backups` returned 500 and no `.sql.gz` was ever produced. The production `DATABASE_URL` contains `sslmode=no-verify`, a node-pg/Prisma value; `pg_dump` (libpq) only accepts disable/allow/prefer/require/verify-ca/verify-full and aborts.

`db-backups/pg-url.ts` (`forPgDump`) now maps any non-libpq sslmode to `require` — TLS on, certificate not verified, the same behaviour `no-verify` has in node-pg — and still moves Prisma's `?schema=` into `-n`. `scripts/restore-db.sh` applies the same translation to its target URL. Valid libpq values and URLs without `sslmode` are untouched.

Reproduced locally: `pg_dump` on `?sslmode=no-verify` prints the exact production error; `require` is accepted. Unit tests cover the URL handling.

After deploying, press "צור גיבוי עכשיו" on the גיבויים page and confirm a `.sql.gz` appears and reaches Slack.
