-- A serialized item instance can be held by at most one soldier at a time.
-- Enforced in the database so no application bug can produce a double-signed weapon.
CREATE UNIQUE INDEX "signatures_one_active_holder_per_instance"
  ON "signatures" ("item_instance_id")
  WHERE "returned_at" IS NULL AND "item_instance_id" IS NOT NULL;

-- A non-serialized item is signed once per soldier per item (quantity carries the count),
-- so returns and counts stay unambiguous.
CREATE UNIQUE INDEX "signatures_one_active_bulk_per_soldier_item"
  ON "signatures" ("soldier_id", "item_id")
  WHERE "returned_at" IS NULL AND "item_instance_id" IS NULL;

-- Quantity must be positive.
ALTER TABLE "signatures"
  ADD CONSTRAINT "signatures_quantity_positive" CHECK ("quantity" > 0);

-- A return cannot predate the signature.
ALTER TABLE "signatures"
  ADD CONSTRAINT "signatures_returned_after_signed"
  CHECK ("returned_at" IS NULL OR "returned_at" >= "signed_at");

-- Movements are append-only: block UPDATE and DELETE at the database level.
CREATE OR REPLACE FUNCTION "movements_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'movements is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "movements_no_update"
  BEFORE UPDATE ON "movements"
  FOR EACH ROW EXECUTE FUNCTION "movements_append_only"();

CREATE TRIGGER "movements_no_delete"
  BEFORE DELETE ON "movements"
  FOR EACH ROW EXECUTE FUNCTION "movements_append_only"();
