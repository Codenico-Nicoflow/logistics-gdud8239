-- Multi-tenant step 1b: companies become a per-battalion table, and the "contract" half of step 1a lands.
--
-- Nothing here runs an UPDATE. The history tables (movements, issue_forms) are append-only through
-- BEFORE UPDATE OR DELETE triggers, and `ALTER COLUMN ... TYPE ... USING` rewrites a table without firing
-- row triggers, so the enum -> text conversion below never trips them. The conversion maps the enum's
-- stored Hebrew label to the company's code in the same statement, so there is no separate backfill.

-- ---------- companies ----------

CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "battalion_id" TEXT NOT NULL DEFAULT current_battalion_id(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "companies_battalion_id_code_key" ON "companies"("battalion_id", "code");
CREATE UNIQUE INDEX "companies_battalion_id_name_key" ON "companies"("battalion_id", "name");
CREATE INDEX "companies_battalion_id_idx" ON "companies"("battalion_id");
ALTER TABLE "companies" ADD CONSTRAINT "companies_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8239's five companies, exactly as the enum had them. Any other battalion starts with none.
INSERT INTO "companies" ("id", "battalion_id", "code", "name", "sort_order") VALUES
    (gen_random_uuid()::text, '00000000-0000-4000-8000-000000008239', 'A',       'א',      0),
    (gen_random_uuid()::text, '00000000-0000-4000-8000-000000008239', 'B',       'ב',      1),
    (gen_random_uuid()::text, '00000000-0000-4000-8000-000000008239', 'C',       'ג',      2),
    (gen_random_uuid()::text, '00000000-0000-4000-8000-000000008239', 'SUPPORT', 'מסייעת', 3),
    (gen_random_uuid()::text, '00000000-0000-4000-8000-000000008239', 'HQ',      'מפקדה',  4);

-- ---------- enum columns -> text company code ----------
-- The enum stored the Hebrew label (@map); the code is what the API always called it.

ALTER TABLE "soldiers" ALTER COLUMN "company" TYPE TEXT USING (CASE "company"::text
    WHEN 'א' THEN 'A' WHEN 'ב' THEN 'B' WHEN 'ג' THEN 'C' WHEN 'מסייעת' THEN 'SUPPORT' WHEN 'מפקדה' THEN 'HQ' END);
ALTER TABLE "users" ALTER COLUMN "company_scope" TYPE TEXT USING (CASE "company_scope"::text
    WHEN 'א' THEN 'A' WHEN 'ב' THEN 'B' WHEN 'ג' THEN 'C' WHEN 'מסייעת' THEN 'SUPPORT' WHEN 'מפקדה' THEN 'HQ' END);
ALTER TABLE "company_allocations" ALTER COLUMN "company" TYPE TEXT USING (CASE "company"::text
    WHEN 'א' THEN 'A' WHEN 'ב' THEN 'B' WHEN 'ג' THEN 'C' WHEN 'מסייעת' THEN 'SUPPORT' WHEN 'מפקדה' THEN 'HQ' END);
-- History: a plain snapshot of the code at the time, no foreign key (a snapshot must outlive its company).
ALTER TABLE "issue_forms" ALTER COLUMN "company_snapshot" TYPE TEXT USING (CASE "company_snapshot"::text
    WHEN 'א' THEN 'A' WHEN 'ב' THEN 'B' WHEN 'ג' THEN 'C' WHEN 'מסייעת' THEN 'SUPPORT' WHEN 'מפקדה' THEN 'HQ' END);
ALTER TABLE "movements" ALTER COLUMN "company_snapshot" TYPE TEXT USING (CASE "company_snapshot"::text
    WHEN 'א' THEN 'A' WHEN 'ב' THEN 'B' WHEN 'ג' THEN 'C' WHEN 'מסייעת' THEN 'SUPPORT' WHEN 'מפקדה' THEN 'HQ' END);
ALTER TABLE "ifsun_records" ALTER COLUMN "company_snapshot" TYPE TEXT USING (CASE "company_snapshot"::text
    WHEN 'א' THEN 'A' WHEN 'ב' THEN 'B' WHEN 'ג' THEN 'C' WHEN 'מסייעת' THEN 'SUPPORT' WHEN 'מפקדה' THEN 'HQ' END);

DROP TYPE "Company";

-- A live company reference must be a real company of the same battalion. Renaming a code follows through
-- (ON UPDATE CASCADE); deleting a used company is refused (RESTRICT) — deactivate it instead.
ALTER TABLE "soldiers" ADD CONSTRAINT "soldiers_battalion_id_company_fkey" FOREIGN KEY ("battalion_id", "company") REFERENCES "companies"("battalion_id", "code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_battalion_id_company_scope_fkey" FOREIGN KEY ("battalion_id", "company_scope") REFERENCES "companies"("battalion_id", "code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_allocations" ADD CONSTRAINT "company_allocations_battalion_id_company_fkey" FOREIGN KEY ("battalion_id", "company") REFERENCES "companies"("battalion_id", "code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- contract half of step 1a ----------
-- The single-column uniques the expand step kept beside the per-battalion ones.

DROP INDEX "soldiers_personal_number_key";
DROP INDEX "items_name_key";
DROP INDEX "team_members_nickname_key";
DROP INDEX "count_sessions_session_date_shift_key";
DROP INDEX "daily_summary_exports_session_date_key";
DROP INDEX "attendance_week_sends_cron_key_key";

-- Settings are per battalion: the key alone is no longer the primary key.
ALTER TABLE "app_settings" DROP CONSTRAINT "app_settings_pkey";
DROP INDEX "app_settings_battalion_id_key_key";
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("battalion_id", "key");

-- 1008 numbers come from each battalion's own counter now, never from one global sequence.
DROP INDEX "issue_forms_form_no_key";
ALTER TABLE "issue_forms" ALTER COLUMN "form_no" DROP DEFAULT;
DROP SEQUENCE "issue_forms_form_no_seq";
