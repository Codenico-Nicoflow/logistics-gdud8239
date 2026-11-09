-- `י"ח` on the paper 1008: the unit a quantity is counted in.
ALTER TABLE "items" ADD COLUMN "unit_of_measure" TEXT NOT NULL DEFAULT 'יח''';

-- Columns the scanned form has that the first cut of this table did not.
ALTER TABLE "issue_forms" ADD COLUMN "receipt_no" TEXT;
ALTER TABLE "issue_forms" ADD COLUMN "issuer_personal_number" TEXT;
-- The paper form is signed by both parties; so is this one.
ALTER TABLE "issue_forms" ADD COLUMN "issuer_signature_image" TEXT;

ALTER TABLE "issue_form_lines" ADD COLUMN "unit_of_measure" TEXT NOT NULL DEFAULT 'יח''';
ALTER TABLE "issue_form_lines" ADD COLUMN "line_notes" TEXT;

-- A standard handover: the rifle plus what always goes out with it.
CREATE TABLE "kits" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "kits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kits_name_key" ON "kits"("name");

CREATE TABLE "kit_lines" (
    "id" TEXT NOT NULL,
    "kit_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "kit_lines_pkey" PRIMARY KEY ("id")
);

-- One line per item in a kit: two rows for the same item would be two
-- quantities for one thing, with no way to say which is meant.
CREATE UNIQUE INDEX "kit_lines_kit_id_item_id_key" ON "kit_lines"("kit_id", "item_id");
CREATE INDEX "kit_lines_kit_id_idx" ON "kit_lines"("kit_id");

ALTER TABLE "kit_lines" ADD CONSTRAINT "kit_lines_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "kit_lines" ADD CONSTRAINT "kit_lines_kit_id_fkey"
  FOREIGN KEY ("kit_id") REFERENCES "kits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Restrict: an item inside a kit cannot be deleted out from under it.
ALTER TABLE "kit_lines" ADD CONSTRAINT "kit_lines_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
