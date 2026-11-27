-- A battalion created from now on starts as the ready skeleton: the optional modules are off until its
-- super admin switches them on. A battalion that already exists has no rows, and "no row" reads as ON,
-- so nothing it uses disappears.
CREATE OR REPLACE FUNCTION create_battalion(p_name TEXT, p_number TEXT) RETURNS TEXT
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$
DECLARE
    new_id TEXT := gen_random_uuid()::text;
BEGIN
    INSERT INTO "battalions" ("id", "name", "number") VALUES (new_id, p_name, p_number);
    INSERT INTO "form_counters" ("battalion_id") VALUES (new_id);
    INSERT INTO "app_settings" ("battalion_id", "key", "value", "updated_at")
    VALUES (new_id, 'module.companySplit', 'false', now()),
           (new_id, 'module.attendance', 'false', now()),
           (new_id, 'module.kits', 'false', now());
    RETURN new_id;
END
$$;
