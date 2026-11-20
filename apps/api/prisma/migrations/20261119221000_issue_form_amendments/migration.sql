CREATE TABLE "issue_form_amendments" (
  "id" TEXT NOT NULL,
  "issue_form_id" TEXT NOT NULL,
  "receipt_no" TEXT,
  "notes" TEXT,
  "amended_by_user_id" TEXT NOT NULL,
  "amended_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "issue_form_amendments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "issue_form_amendments_issue_form_id_amended_at_idx"
  ON "issue_form_amendments" ("issue_form_id", "amended_at");

ALTER TABLE "issue_form_amendments"
  ADD CONSTRAINT "issue_form_amendments_issue_form_id_fkey"
  FOREIGN KEY ("issue_form_id") REFERENCES "issue_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_form_amendments"
  ADD CONSTRAINT "issue_form_amendments_amended_by_user_id_fkey"
  FOREIGN KEY ("amended_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An amendment is itself a correction on record; it must not be quietly
-- edited or deleted either, same reasoning as issue_forms itself.
CREATE OR REPLACE FUNCTION "issue_form_amendments_append_only"() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'issue_form_amendments is append-only (attempted %)', TG_OP; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "issue_form_amendments_no_update_delete"
  BEFORE UPDATE OR DELETE ON "issue_form_amendments"
  FOR EACH ROW EXECUTE FUNCTION "issue_form_amendments_append_only"();
