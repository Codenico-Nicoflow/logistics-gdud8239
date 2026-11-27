-- Battalion foundation (multi-tenant step 1a). 8239 stays the only battalion; nothing it does changes.
--
-- Append-only guarantee: `movements`, `issue_forms`, `issue_form_amendments`, `item_kit_changes` and
-- `item_replacements` have BEFORE UPDATE OR DELETE triggers. This migration never runs an UPDATE on any
-- table. `ADD COLUMN ... DEFAULT <constant>` is a metadata-only change in Postgres 11+: existing rows read
-- the constant without being rewritten, and no row trigger fires. The default is then switched to
-- `current_battalion_id()` for future rows (SET DEFAULT does not touch existing rows).

CREATE TABLE "battalions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "battalions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "battalions_number_key" ON "battalions"("number");

INSERT INTO "battalions" ("id", "name", "number") VALUES ('00000000-0000-4000-8000-000000008239', 'גדוד 8239', '8239');

-- The tenant a row belongs to when its insert does not say. `app.battalion_id` is the per-request setting
-- (step 2 sets it from the login token). Until then, and only until then, it falls back to the oldest
-- battalion, which is 8239: this fallback is single-tenant scaffolding and goes away in step 2.
CREATE FUNCTION current_battalion_id() RETURNS TEXT
    LANGUAGE sql STABLE
    AS $$ SELECT COALESCE(NULLIF(current_setting('app.battalion_id', true), ''),
                          (SELECT "id" FROM "battalions" ORDER BY "created_at", "id" LIMIT 1)) $$;

-- users
ALTER TABLE "users" ADD COLUMN "battalion_id" TEXT DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "users" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "users_battalion_id_idx" ON "users"("battalion_id");
ALTER TABLE "users" ADD CONSTRAINT "users_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- soldiers
ALTER TABLE "soldiers" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "soldiers" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "soldiers_battalion_id_idx" ON "soldiers"("battalion_id");
ALTER TABLE "soldiers" ADD CONSTRAINT "soldiers_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- soldier_enlistments
ALTER TABLE "soldier_enlistments" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "soldier_enlistments" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "soldier_enlistments_battalion_id_idx" ON "soldier_enlistments"("battalion_id");
ALTER TABLE "soldier_enlistments" ADD CONSTRAINT "soldier_enlistments_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- team_members
ALTER TABLE "team_members" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "team_members" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "team_members_battalion_id_idx" ON "team_members"("battalion_id");
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- items
ALTER TABLE "items" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "items" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "items_battalion_id_idx" ON "items"("battalion_id");
ALTER TABLE "items" ADD CONSTRAINT "items_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- item_kits
ALTER TABLE "item_kits" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "item_kits" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "item_kits_battalion_id_idx" ON "item_kits"("battalion_id");
ALTER TABLE "item_kits" ADD CONSTRAINT "item_kits_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- item_kit_lines
ALTER TABLE "item_kit_lines" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "item_kit_lines" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "item_kit_lines_battalion_id_idx" ON "item_kit_lines"("battalion_id");
ALTER TABLE "item_kit_lines" ADD CONSTRAINT "item_kit_lines_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- item_kit_changes
ALTER TABLE "item_kit_changes" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "item_kit_changes" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "item_kit_changes_battalion_id_idx" ON "item_kit_changes"("battalion_id");
ALTER TABLE "item_kit_changes" ADD CONSTRAINT "item_kit_changes_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- item_replacements
ALTER TABLE "item_replacements" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "item_replacements" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "item_replacements_battalion_id_idx" ON "item_replacements"("battalion_id");
ALTER TABLE "item_replacements" ADD CONSTRAINT "item_replacements_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- item_instances
ALTER TABLE "item_instances" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "item_instances" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "item_instances_battalion_id_idx" ON "item_instances"("battalion_id");
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- signatures
ALTER TABLE "signatures" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "signatures" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "signatures_battalion_id_idx" ON "signatures"("battalion_id");
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- issue_forms
ALTER TABLE "issue_forms" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "issue_forms" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "issue_forms_battalion_id_idx" ON "issue_forms"("battalion_id");
ALTER TABLE "issue_forms" ADD CONSTRAINT "issue_forms_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- issue_form_lines
ALTER TABLE "issue_form_lines" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "issue_form_lines" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "issue_form_lines_battalion_id_idx" ON "issue_form_lines"("battalion_id");
ALTER TABLE "issue_form_lines" ADD CONSTRAINT "issue_form_lines_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- issue_form_amendments
ALTER TABLE "issue_form_amendments" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "issue_form_amendments" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "issue_form_amendments_battalion_id_idx" ON "issue_form_amendments"("battalion_id");
ALTER TABLE "issue_form_amendments" ADD CONSTRAINT "issue_form_amendments_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- movements
ALTER TABLE "movements" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "movements" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "movements_battalion_id_idx" ON "movements"("battalion_id");
ALTER TABLE "movements" ADD CONSTRAINT "movements_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- service_periods
ALTER TABLE "service_periods" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "service_periods" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "service_periods_battalion_id_idx" ON "service_periods"("battalion_id");
ALTER TABLE "service_periods" ADD CONSTRAINT "service_periods_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- company_allocations
ALTER TABLE "company_allocations" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "company_allocations" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "company_allocations_battalion_id_idx" ON "company_allocations"("battalion_id");
ALTER TABLE "company_allocations" ADD CONSTRAINT "company_allocations_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- service_period_item_overrides
ALTER TABLE "service_period_item_overrides" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "service_period_item_overrides" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "service_period_item_overrides_battalion_id_idx" ON "service_period_item_overrides"("battalion_id");
ALTER TABLE "service_period_item_overrides" ADD CONSTRAINT "service_period_item_overrides_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- soldier_allocations_v2
ALTER TABLE "soldier_allocations_v2" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "soldier_allocations_v2" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "soldier_allocations_v2_battalion_id_idx" ON "soldier_allocations_v2"("battalion_id");
ALTER TABLE "soldier_allocations_v2" ADD CONSTRAINT "soldier_allocations_v2_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- count_sessions
ALTER TABLE "count_sessions" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "count_sessions" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "count_sessions_battalion_id_idx" ON "count_sessions"("battalion_id");
ALTER TABLE "count_sessions" ADD CONSTRAINT "count_sessions_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- count_session_figures
ALTER TABLE "count_session_figures" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "count_session_figures" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "count_session_figures_battalion_id_idx" ON "count_session_figures"("battalion_id");
ALTER TABLE "count_session_figures" ADD CONSTRAINT "count_session_figures_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- count_lines
ALTER TABLE "count_lines" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "count_lines" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "count_lines_battalion_id_idx" ON "count_lines"("battalion_id");
ALTER TABLE "count_lines" ADD CONSTRAINT "count_lines_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- count_session_reopens
ALTER TABLE "count_session_reopens" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "count_session_reopens" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "count_session_reopens_battalion_id_idx" ON "count_session_reopens"("battalion_id");
ALTER TABLE "count_session_reopens" ADD CONSTRAINT "count_session_reopens_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- daily_summary_lines
ALTER TABLE "daily_summary_lines" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "daily_summary_lines" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "daily_summary_lines_battalion_id_idx" ON "daily_summary_lines"("battalion_id");
ALTER TABLE "daily_summary_lines" ADD CONSTRAINT "daily_summary_lines_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- daily_summary_exports
ALTER TABLE "daily_summary_exports" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "daily_summary_exports" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "daily_summary_exports_battalion_id_idx" ON "daily_summary_exports"("battalion_id");
ALTER TABLE "daily_summary_exports" ADD CONSTRAINT "daily_summary_exports_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- attendance
ALTER TABLE "attendance" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "attendance" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "attendance_battalion_id_idx" ON "attendance"("battalion_id");
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- import_issues
ALTER TABLE "import_issues" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "import_issues" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "import_issues_battalion_id_idx" ON "import_issues"("battalion_id");
ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- import_logs
ALTER TABLE "import_logs" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "import_logs" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "import_logs_battalion_id_idx" ON "import_logs"("battalion_id");
ALTER TABLE "import_logs" ADD CONSTRAINT "import_logs_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- snapshots
ALTER TABLE "snapshots" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "snapshots" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "snapshots_battalion_id_idx" ON "snapshots"("battalion_id");
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- count_session_deletions
ALTER TABLE "count_session_deletions" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "count_session_deletions" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "count_session_deletions_battalion_id_idx" ON "count_session_deletions"("battalion_id");
ALTER TABLE "count_session_deletions" ADD CONSTRAINT "count_session_deletions_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ifsun_records
ALTER TABLE "ifsun_records" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "ifsun_records" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "ifsun_records_battalion_id_idx" ON "ifsun_records"("battalion_id");
ALTER TABLE "ifsun_records" ADD CONSTRAINT "ifsun_records_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- attendance_week_sends
ALTER TABLE "attendance_week_sends" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "attendance_week_sends" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "attendance_week_sends_battalion_id_idx" ON "attendance_week_sends"("battalion_id");
ALTER TABLE "attendance_week_sends" ADD CONSTRAINT "attendance_week_sends_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- app_settings
ALTER TABLE "app_settings" ADD COLUMN "battalion_id" TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "app_settings" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "app_settings_battalion_id_idx" ON "app_settings"("battalion_id");
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- security_events
ALTER TABLE "security_events" ADD COLUMN "battalion_id" TEXT DEFAULT '00000000-0000-4000-8000-000000008239';
ALTER TABLE "security_events" ALTER COLUMN "battalion_id" SET DEFAULT current_battalion_id();
CREATE INDEX "security_events_battalion_id_idx" ON "security_events"("battalion_id");
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Per-battalion uniques, ADDED beside the old single-column ones. The old ones stay until a follow-up
-- migration (contract step) drops them: during a deploy the previous version of the app is still serving
-- while this migration runs, and it relies on `ON CONFLICT (key)` upserts and on the form-number sequence.
CREATE UNIQUE INDEX "soldiers_battalion_id_personal_number_key" ON "soldiers"("battalion_id", "personal_number");
CREATE UNIQUE INDEX "items_battalion_id_name_key" ON "items"("battalion_id", "name");
CREATE UNIQUE INDEX "team_members_battalion_id_nickname_key" ON "team_members"("battalion_id", "nickname");
CREATE UNIQUE INDEX "count_sessions_battalion_id_session_date_shift_key" ON "count_sessions"("battalion_id", "session_date", "shift");
CREATE UNIQUE INDEX "daily_summary_exports_battalion_id_session_date_key" ON "daily_summary_exports"("battalion_id", "session_date");
CREATE UNIQUE INDEX "attendance_week_sends_battalion_id_cron_key_key" ON "attendance_week_sends"("battalion_id", "cron_key");
CREATE UNIQUE INDEX "app_settings_battalion_id_key_key" ON "app_settings"("battalion_id", "key");
CREATE UNIQUE INDEX "issue_forms_battalion_id_form_no_key" ON "issue_forms"("battalion_id", "form_no");

-- 1008 numbering: one counter per battalion. 8239 carries on from its last number, so no printed form
-- number is ever reused or renumbered. The old global sequence stays as the column default for now (same
-- reason as above); the app now passes the number from this counter explicitly.
CREATE TABLE "form_counters" (
    "battalion_id" TEXT NOT NULL,
    "next_form_no" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "form_counters_pkey" PRIMARY KEY ("battalion_id")
);
ALTER TABLE "form_counters" ADD CONSTRAINT "form_counters_battalion_id_fkey" FOREIGN KEY ("battalion_id") REFERENCES "battalions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "form_counters" ("battalion_id", "next_form_no")
    SELECT '00000000-0000-4000-8000-000000008239', COALESCE(MAX("form_no"), 0) + 1 FROM "issue_forms";
