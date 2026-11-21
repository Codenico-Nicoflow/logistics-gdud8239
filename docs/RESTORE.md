# Restore manual — recovering the system from a backup

Use this when the production database is lost, corrupted, or must be moved. Read it once now, before you need it.

## What a backup contains

The full backup (`logistics-db-….sql.gz`, from the גיבויים page and the Slack channel) is a `pg_dump` of the whole database: catalog and מסדים, soldiers, signatures, 1008 forms with their drawn signatures, movements, אפסון (with signatures), counts and their frozen figures, מסכם, service periods and allocations, attendance, users and the permission matrix.

**Not in it:** the generated Excel snapshot files and the backup files themselves (they live on the API's disk), and the Render secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, Slack tokens). Keep the secrets in a password manager. If the two JWT secrets change, everyone is simply logged out.

You get the data as it was at the moment of that backup. Anything done afterwards is lost.

## Option A — Render's own recovery (try this first)

On a paid plan, Render Postgres keeps its own backups and can restore to an earlier point in time from the dashboard: open the database → the recovery/backups section. No tools needed. Check what your plan includes and how far back it goes.

## Option B — restore our backup file

Needed when Option A is not available, or the database was deleted entirely.

### Prerequisites
- the repository on your computer
- `psql` installed (`brew install libpq`); keep it at least as new as the server's Postgres version
- the backup file: download it from the גיבויים page, or from the Slack channel if the app is down

### Steps
1. **Create an empty database.** In the Render dashboard create a new Postgres. Use a new one rather than wiping the old one — the old one stays as an extra copy until you have confirmed everything works. Copy its **External Database URL**.
2. **Restore into it**, from the repository folder:
   ```bash
   RESTORE_DATABASE_URL="<External Database URL>" npm run restore -- ~/Downloads/logistics-db-….sql.gz
   ```
   It prints `restored N tables` and every table with its row count.
3. **Point the API at it.** In Render, on `logistics-api`, set `DATABASE_URL` to the new database's **Internal Database URL**, then Deploy. The Vercel frontend does not change. The migrations table is restored too, so `migrate deploy` does nothing and the app starts on the same schema.
4. **Check it.** Log in. Look at the soldiers list, a few signatures, the latest count and מסכם. Open one אפסון document and confirm the signature image is there.

### Safety built into the script
- The target comes from `RESTORE_DATABASE_URL` or an argument — never from `DATABASE_URL` — so a shell that points at production cannot be restored into by accident.
- It refuses any database that already has tables. A backup is never merged into live data.
- A backup made by a newer `pg_dump` than the server loading it is handled (the script drops the session settings an older server rejects).

## Rehearsal (do this once, on a quiet day)

A backup you have never restored is a guess. Create a temporary Postgres on Render, restore a real production backup into it, then compare it with the live database:

```bash
RESTORE_DATABASE_URL="<temporary DB External URL>" npm run restore -- backup.sql.gz --compare "<live DB External URL>"
```

Every table should print `ok`. Delete the temporary database afterwards. A table showing `DIFF` after a backup taken a while ago only means the live data changed since; take a fresh manual backup and compare again.

## What was tested

The restore was run end to end on a local database: 32 of 32 tables restored, every row count equal, the contents identical (checksum) for soldiers, items, מסדים, signatures, 1008 forms with signature images, movements, אפסון, users, permissions and allocations, the append-only triggers and all indexes back, and the API test suites green against the restored database. It has not yet been rehearsed on Render itself — do the rehearsal above.

## Still open
- A second copy outside Slack (Cloudflare R2).
- No in-app restore button, on purpose: overwriting production from a web page is too dangerous to be one click.
