-- אבזור: magazines, slings, cleaning kits. Signed for on the 1008 but never
-- counted in the nightly ספירה and carrying no מסד.
ALTER TYPE "ItemCategory" ADD VALUE 'אבזור' BEFORE 'ציוד';

-- Pre-filled quantity on the issue form; editable per issue, zero drops the line.
ALTER TABLE "items" ADD COLUMN "default_qty" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "items" ADD CONSTRAINT "items_default_qty_not_negative" CHECK ("default_qty" >= 0);

-- טופס 1008 — one signing event covering everything handed over at once.
CREATE TABLE "issue_forms" (
    "id" TEXT NOT NULL,
    "form_no" SERIAL NOT NULL,
    "soldier_id" TEXT NOT NULL,
    "soldier_name_snapshot" TEXT NOT NULL,
    "personal_number_snapshot" TEXT,
    "company_snapshot" "Company" NOT NULL,
    "phone_snapshot" TEXT,
    "signature_image" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by_user_id" TEXT NOT NULL,
    "issued_by_name_snapshot" TEXT NOT NULL,
    "notes" TEXT,
    CONSTRAINT "issue_forms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "issue_forms_form_no_key" ON "issue_forms"("form_no");
CREATE INDEX "issue_forms_soldier_id_idx" ON "issue_forms"("soldier_id");
CREATE INDEX "issue_forms_signed_at_idx" ON "issue_forms"("signed_at");

CREATE TABLE "issue_form_lines" (
    "id" TEXT NOT NULL,
    "issue_form_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "item_name_snapshot" TEXT NOT NULL,
    "serial_snapshot" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "signature_id" TEXT,
    CONSTRAINT "issue_form_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "issue_form_lines_issue_form_id_idx" ON "issue_form_lines"("issue_form_id");

-- A line must record something actually handed over.
ALTER TABLE "issue_form_lines" ADD CONSTRAINT "issue_form_lines_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "issue_forms" ADD CONSTRAINT "issue_forms_soldier_id_fkey"
  FOREIGN KEY ("soldier_id") REFERENCES "soldiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_forms" ADD CONSTRAINT "issue_forms_issued_by_user_id_fkey"
  FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_form_lines" ADD CONSTRAINT "issue_form_lines_issue_form_id_fkey"
  FOREIGN KEY ("issue_form_id") REFERENCES "issue_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issue_form_lines" ADD CONSTRAINT "issue_form_lines_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A signed form is evidence and must not be quietly edited or deleted.
CREATE OR REPLACE FUNCTION "issue_forms_append_only"() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'issue_forms is append-only (attempted %)', TG_OP; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "issue_forms_no_update_delete"
  BEFORE UPDATE OR DELETE ON "issue_forms"
  FOR EACH ROW EXECUTE FUNCTION "issue_forms_append_only"();
