CREATE TABLE "item_replacements" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "item_name_snapshot" TEXT NOT NULL,
    "old_serial" TEXT,
    "new_serial" TEXT NOT NULL,
    "notes" TEXT,
    "by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_replacements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "item_replacements_item_id_idx" ON "item_replacements"("item_id");
CREATE INDEX "item_replacements_created_at_idx" ON "item_replacements"("created_at");

CREATE FUNCTION "item_replacements_append_only"() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'item_replacements is append-only (attempted %)', TG_OP; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "item_replacements_no_update_delete"
  BEFORE UPDATE OR DELETE ON "item_replacements"
  FOR EACH ROW EXECUTE FUNCTION "item_replacements_append_only"();
