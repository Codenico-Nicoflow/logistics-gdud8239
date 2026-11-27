# Multi-tenant step 2 — tenant isolation

Until now a second battalion was possible but nothing stopped its users from seeing 8239's rows: every
query still ran as the database owner. From here **the database itself keeps battalions apart**, whatever
the application code does.

## How it works

1. **The token names the battalion.** The access token carries `battalionId`. A token without one (issued
   before this change) is refused and the person signs in again.
2. **A tenant scope per request.** `TenantMiddleware` opens an `AsyncLocalStorage` scope for every request
   (`tenancy/tenant-context.ts`). `JwtAuthGuard` binds the battalion from the verified token. The pre-login
   paths — login, refresh, logout, setup link, MFA step token — find the battalion from the account instead
   (`TenantService`, backed by `SECURITY DEFINER` SQL functions that return only an id).
3. **The connection tells Postgres.** `TenantPool` (a `pg.Pool` subclass handed to Prisma's adapter) runs
   `set_config('app.battalion_id', …)` on **every** connection checkout, with an empty value when there is no
   battalion. One hook covers plain queries, interactive and batch transactions and raw SQL — which a
   per-query Prisma extension (Prisma's documented RLS recipe) cannot reach. The battalion is read when
   `connect` is *called*, not when a connection frees up, so a busy pool cannot hand request A's battalion
   to request B.
4. **Row-level security.** Every table with `battalion_id` has a policy
   `battalion_id = current_battalion_id()` (USING and WITH CHECK). The user-keyed tables (`refresh_tokens`,
   `user_invites`, `user_totp`, `totp_backup_codes`) follow their user. A battalion sees only its own row in
   `battalions`.
5. **Fail-closed.** `current_battalion_id()` is `NULL` when nothing is set (the single-tenant "oldest
   battalion" fallback from step 1 is gone): reads return nothing and creates are refused by the `NOT NULL`
   on `battalion_id`.
6. **The app must connect as a role that is subject to all this.** The API serves requests as
   `logistics_app` (`APP_DATABASE_URL`): not the owner, no `BYPASSRLS`. On boot it checks its own role and
   **refuses to start** if it is a superuser, has `BYPASSRLS`, owns tables, or if any table with
   `battalion_id` lacks RLS. In production `APP_DATABASE_URL` is required and must differ from `DATABASE_URL`.
   `DATABASE_URL` stays the owner: migrations, `pg_dump`, scripts.

## Other changes in this step

- **`users.is_platform_admin`**, separate from the in-battalion `is_super_admin` and backfilled from it
  (today that is the product owner). Only the platform admin may use `/db-backups` (a full dump holds every
  battalion) and `/permissions` (one matrix for the whole deployment). `@PlatformAdminOnly()` +
  `PlatformAdminGuard`.
- **Scheduled jobs run once per battalion** (`TenantService.forEachBattalion`): the daily snapshot, the
  Thursday ימי יציאה post, pruning old tokens. The full `pg_dump` is not per battalion.
- **Slack stays 8239-only** until step 6 (`common/slack-bridge.ts`): the one bot token and channel IDs in the
  environment belong to 8239, so no other battalion may post through them.
- `users.battalion_id` and `security_events.battalion_id` are now `NOT NULL`.
- Scripts that write data (`seed`, `import-excel`, `e2e-users`, `mobile-audit-user`) use `scriptPrisma()`,
  bound to one battalion (8239, or `BATTALION_ID`).
- `npm run seed:test-battalion` (dev only, local database only) creates an empty "5033 (בדיקה)" battalion
  with an admin `admin5033`: the ready-skeleton a real new battalion starts from.

## Deploying to Render (one-time, before or with the merge)

The migration creates the role `logistics_app` without a password. Until it has one and the API has its URL,
the API **will not start** (that is the check working).

1. Merge; the deploy's `prisma migrate deploy` creates the role and its grants. If Render's database user is
   not allowed to create roles the migration prints a notice instead: run
   `CREATE ROLE logistics_app LOGIN NOSUPERUSER NOBYPASSRLS;` as the owner once, then redeploy.
2. Pick a long random password. On your machine, with the owner URL:
   `DATABASE_URL=<owner url> APP_DATABASE_URL=postgresql://logistics_app:<password>@<same host>/<db> npm run db:app-role --workspace=apps/api`
3. In Render, set `APP_DATABASE_URL` to that same URL (same host and database as `DATABASE_URL`, user
   `logistics_app`) and redeploy.

## Local development

`apps/api/.env` needs `APP_DATABASE_URL="postgresql://logistics_app:<pw>@localhost:5433/logistics?schema=public"`
(any password), then `npm run migrate` and `npm run db:app-role`. CI does the same.

## Tests (`test/tenant-isolation.e2e.spec.ts`)

- **Schema, by introspection:** every table with `battalion_id` has RLS and a policy; every other table is a
  documented exception — a new table cannot slip through unnoticed.
- **Connection:** on every tenant table, no battalion in scope sees nothing and a battalion never sees a row
  of another; cross-battalion create / update / delete / re-pointing is refused; a connection never carries a
  battalion to its next user; 40 concurrent requests on one connection stay apart.
- **Prisma:** plain, interactive-transaction, batch and raw queries are all filtered.
- **API:** two real battalions — lists, by-id (404), patch/delete, companies, forged and battalion-less
  tokens, refresh, login failure parity, platform-only routes.
- **Boot check:** refuses to start as the owner; starts as the restricted role.

The rest of the e2e suite runs with `TENANT_FALLBACK_BATTALION_ID` set to 8239 (test/setup.ts) for fixtures
written outside a request; it is refused in production.

## Gotchas worth knowing

- A Prisma query is **lazy**: it runs when awaited. `runAsBattalion(id, () => prisma.x.findMany())` therefore
  awaits a returned query inside the scope; code that builds a query in one scope and awaits it in another
  would run for the wrong battalion.
- Not done here (step 4): the גיבויים and הרשאות tabs are still shown to every admin (the API now answers 403
  to a non-platform admin); and act-as will need `users` readable for the acting platform admin's own row,
  because their token names another battalion than their home one.
