# Restoring from a full backup (feat/backup-restore)

The nightly/manual `logistics-db-*.sql.gz` (גיבויים page, and the copy in Slack) is a `pg_dump` of every table: catalog and מסדים, soldiers, signatures, 1008 forms with their drawn signatures, movements, אפסון, counts and their frozen figures, מסכם, service periods and allocations, attendance, users and the permission matrix. Until now nothing could load it back, and it had never been tried.

## Test that was run
Dump of the dev database → fresh empty Postgres 16 → `scripts/restore-db.sh`:
- 32 of 32 tables restored, every row count equal to the source
- md5 of the full contents equal for soldiers, items, item_instances, signatures, issue_forms (incl. signature images), issue_form_lines, movements, ifsun_records, users, role_permissions, allocations
- the 4 append-only triggers and 80 indexes came back
- the API test suites ran green against the restored database

## What the test found
A dump made by a newer `pg_dump` than the restoring server (here 18 → 16) fails with `unrecognized configuration parameter "transaction_timeout"`, and a fresh database already has `public`. The script drops those lines (`SET transaction_timeout`, `CREATE SCHEMA public;`, psql's `\restrict` guard) — settings, not data — so a backup restores whatever version made it.

## How to restore (disaster)
1. Download the `.sql.gz` from גיבויים or Slack.
2. Create an **empty** Postgres database (new Render Postgres, or an emptied one).
3. `scripts/restore-db.sh logistics-db-….sql.gz "<new DATABASE_URL>"`
4. Point the API's `DATABASE_URL` at it and redeploy. `_prisma_migrations` is restored too, so `migrate deploy` does nothing and the app starts on the same schema.

The script refuses a database that already has tables — it never merges a backup into live data. To verify a backup without a disaster, restore into a throwaway database and add `--compare <live-url>` to diff every table's row count.

## Not covered by this backup
- the generated Excel snapshot files and the backup files themselves (they live on the API's disk; only their rows are in the database)
- secrets (Render env vars: JWT secrets, Slack tokens) — keep them in the password manager

## Follow-ups
- A second copy outside Slack (Cloudflare R2) is still open.
- No in-app restore button, on purpose: overwriting production from a web page is too dangerous to be one click.
