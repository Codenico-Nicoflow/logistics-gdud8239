-- Platform administration (step 4): creating battalions, and acting inside one.

-- 1. A platform admin who acts inside a battalion does so through a stand-in account of that battalion
--    (`acts_for_id` names the real person). The stand-in is an ordinary user row there, so every audit
--    column and join resolves inside the battalion's own data, and row-level security still lets no row of
--    another battalion through. It has no password and cannot sign in by itself.
ALTER TABLE "users" ADD COLUMN "acts_for_id" TEXT;
CREATE UNIQUE INDEX "users_acts_for_id_battalion_id_key" ON "users"("acts_for_id", "battalion_id");

-- 2. What only the platform operator may ask, and which row-level security hides from every battalion.
--    SECURITY DEFINER so the application role needs no bypass; the application checks the caller first.

-- Whether this user is a live platform admin in their own battalion (never a stand-in), and where that is.
CREATE FUNCTION platform_actor(p_user_id TEXT)
    RETURNS TABLE (battalion_id TEXT, username TEXT, display_name TEXT)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT "battalion_id", "username", "display_name" FROM "users"
          WHERE "id" = p_user_id AND "is_active" AND "is_platform_admin" AND "acts_for_id" IS NULL $$;

-- Every battalion with the numbers that tell the operator which are set up and in use.
CREATE FUNCTION platform_battalions()
    RETURNS TABLE (id TEXT, name TEXT, number TEXT, created_at TIMESTAMP, user_count INTEGER, admin_count INTEGER, has_logo BOOLEAN)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT b."id", b."name", b."number", b."created_at",
                 (SELECT count(*)::int FROM "users" u WHERE u."battalion_id" = b."id" AND u."acts_for_id" IS NULL),
                 (SELECT count(*)::int FROM "users" u WHERE u."battalion_id" = b."id" AND u."acts_for_id" IS NULL
                                                         AND u."role" = 'admin' AND u."is_active" AND NOT u."must_setup"),
                 b."logo_mime" IS NOT NULL
          FROM "battalions" b ORDER BY b."created_at", b."id" $$;

-- A battalion starts with its row and its own 1008 counter, and nothing else: the ready skeleton.
CREATE FUNCTION create_battalion(p_name TEXT, p_number TEXT) RETURNS TEXT
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
DECLARE
    new_id TEXT := gen_random_uuid()::text;
BEGIN
    INSERT INTO "battalions" ("id", "name", "number") VALUES (new_id, p_name, p_number);
    INSERT INTO "form_counters" ("battalion_id") VALUES (new_id);
    RETURN new_id;
END
$$;
