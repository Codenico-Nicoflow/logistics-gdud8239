-- Tenant isolation (multi-tenant step 2). From here the DATABASE refuses to show or accept another
-- battalion's rows, whatever the application code does: the app connects as a role that is subject to
-- row-level security, and every policy compares `battalion_id` with the battalion the connection was
-- told it is serving (`app.battalion_id`, set from the login token on every connection checkout).
--
-- Fail-closed: with no battalion set, `current_battalion_id()` is NULL, so a read sees nothing and a
-- create is refused by the NOT NULL on `battalion_id`. The single-tenant fallback to "the oldest
-- battalion" that step 1 shipped is gone.
--
-- The owner role (migrations, pg_dump, tests, seed) is not forced through RLS and so sees everything;
-- the application must never connect as it. The API refuses to start if it does (see rls-check.ts).
-- Nothing below UPDATEs an append-only table.

-- 1. The battalion a connection serves. NULL when unset.
CREATE OR REPLACE FUNCTION current_battalion_id() RETURNS TEXT
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.battalion_id', true), '') $$;

-- 2. Users and security events always belong to a battalion (a platform admin has a home battalion and
--    switches with act-as, step 4).
ALTER TABLE "users" ALTER COLUMN "battalion_id" SET NOT NULL;
ALTER TABLE "security_events" ALTER COLUMN "battalion_id" SET NOT NULL;

-- 3. The platform operator flag, separate from the in-battalion `is_super_admin`. Whoever is a super
--    admin today is the operator (there is exactly one: the product owner).
ALTER TABLE "users" ADD COLUMN "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;
UPDATE "users" SET "is_platform_admin" = "is_super_admin";

-- 4. Lookups that must run BEFORE a battalion is known (who is this username, whose refresh token is
--    this, which battalions exist for a scheduled job). They are SECURITY DEFINER so the application
--    role needs no bypass, and each returns only an id, never a row.
CREATE FUNCTION battalion_of_username(p_username TEXT) RETURNS TEXT
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT "battalion_id" FROM "users" WHERE "username" = p_username $$;

CREATE FUNCTION battalion_of_user(p_user_id TEXT) RETURNS TEXT
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT "battalion_id" FROM "users" WHERE "id" = p_user_id $$;

CREATE FUNCTION battalion_of_invite(p_token_hash TEXT) RETURNS TEXT
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT u."battalion_id" FROM "user_invites" i JOIN "users" u ON u."id" = i."user_id" WHERE i."token_hash" = p_token_hash $$;

CREATE FUNCTION all_battalion_ids() RETURNS SETOF TEXT
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT "id" FROM "battalions" ORDER BY "created_at", "id" $$;

-- 5. Row-level security on every table that carries `battalion_id` (found by name, so this cannot miss
--    one that exists today; the test suite fails if a future table gets the column without a policy).
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'battalion_id' AND c.table_name <> 'battalions'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("battalion_id" = current_battalion_id()) WITH CHECK ("battalion_id" = current_battalion_id())', t);
  END LOOP;
END $$;

-- A battalion sees only itself, and cannot change that row's identity.
ALTER TABLE "battalions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "battalions" USING ("id" = current_battalion_id()) WITH CHECK ("id" = current_battalion_id());

-- Tables keyed by user, not battalion: they follow the user's battalion. (`users` is itself filtered
-- by the policy above, so the sub-select cannot reach another battalion's user.)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['refresh_tokens', 'user_invites', 'user_totp', 'totp_backup_codes']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "user_id")) WITH CHECK (EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "user_id"))', t);
  END LOOP;
END $$;
-- `role_permissions` and `db_backups` hold no battalion data and have no policy; the API only lets the
-- platform admin touch them.

-- 6. The application role: not the owner, not superuser, no BYPASSRLS. It has no password here; the
--    operator sets one once (npm run db:app-role) and points APP_DATABASE_URL at it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'logistics_app') THEN
    BEGIN
      CREATE ROLE logistics_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'could not create role logistics_app: create it by hand (see docs/feat-mt-isolation.md)';
    END;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'logistics_app') THEN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO logistics_app', current_database());
    GRANT USAGE ON SCHEMA public TO logistics_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO logistics_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO logistics_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO logistics_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO logistics_app;
    REVOKE ALL ON "_prisma_migrations" FROM logistics_app;
    -- A battalion row is created and renamed by the platform operator (step 4), never by tenant code.
    REVOKE INSERT, DELETE ON "battalions" FROM logistics_app;
  END IF;
END $$;
