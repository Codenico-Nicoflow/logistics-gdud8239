-- CreateEnum
CREATE TYPE "KitLineMode" AS ENUM ('ALWAYS', 'IF_ALLOCATED');

-- CreateTable
CREATE TABLE "item_kits" (
    "id" TEXT NOT NULL,
    "base_item_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_kits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_kit_lines" (
    "id" TEXT NOT NULL,
    "kit_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "mode" "KitLineMode" NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "item_kit_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_kit_changes" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "base_item_id" TEXT NOT NULL,
    "base_item_name" TEXT NOT NULL,
    "actor_name" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,

    CONSTRAINT "item_kit_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_kits_base_item_id_key" ON "item_kits"("base_item_id");

-- CreateIndex
CREATE INDEX "item_kit_lines_item_id_idx" ON "item_kit_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_kit_lines_kit_id_item_id_key" ON "item_kit_lines"("kit_id", "item_id");

-- CreateIndex
CREATE INDEX "item_kit_changes_base_item_id_at_idx" ON "item_kit_changes"("base_item_id", "at");

-- AddForeignKey
ALTER TABLE "item_kits" ADD CONSTRAINT "item_kits_base_item_id_fkey" FOREIGN KEY ("base_item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_kit_lines" ADD CONSTRAINT "item_kit_lines_kit_id_fkey" FOREIGN KEY ("kit_id") REFERENCES "item_kits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_kit_lines" ADD CONSTRAINT "item_kit_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only history, like movements: a kit edit must stay answerable ("who changed the M-4 kit").
CREATE OR REPLACE FUNCTION "item_kit_changes_append_only"() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'item_kit_changes is append-only (attempted %)', TG_OP; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "item_kit_changes_no_update_delete"
  BEFORE UPDATE OR DELETE ON "item_kit_changes"
  FOR EACH ROW EXECUTE FUNCTION "item_kit_changes_append_only"();

-- One-time seed of the rules that were hardcoded in issue-bundle-rules.ts, matched on the exact
-- catalog name. A name with no catalog match is skipped and reported, never a failure: the admin
-- adds the line by hand on the ערכות screen.
DO $seed$
DECLARE
  r RECORD;
  base_id TEXT;
  item_id TEXT;
  kit_id TEXT;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('M-4', 'מחסנית', 5, 'ALWAYS'::"KitLineMode", 0),
    ('M-4', 'מק פורק', 1, 'ALWAYS'::"KitLineMode", 1),
    ('M-4', 'רצועה', 1, 'ALWAYS'::"KitLineMode", 2),
    ('M-4', 'מתפסים', 3, 'ALWAYS'::"KitLineMode", 3),
    ('M-4', 'מטולון', 1, 'IF_ALLOCATED'::"KitLineMode", 4),
    ('M-4', 'מכפל', 1, 'IF_ALLOCATED'::"KitLineMode", 5),
    ('M-4', 'שחמ', 1, 'IF_ALLOCATED'::"KitLineMode", 6),
    ('M-4', 'שחע', 1, 'IF_ALLOCATED'::"KitLineMode", 7),
    ('M-4', 'ציין לייזר', 1, 'IF_ALLOCATED'::"KitLineMode", 8),
    ('M-4', 'עכבר', 1, 'IF_ALLOCATED'::"KitLineMode", 9),
    ('M-4', 'עידו', 1, 'IF_ALLOCATED'::"KitLineMode", 10),
    ('M-4', 'משקפת', 1, 'IF_ALLOCATED'::"KitLineMode", 11),
    ('M-4', 'מצפן', 1, 'IF_ALLOCATED'::"KitLineMode", 12),
    ('M-16', 'מחסנית', 5, 'ALWAYS'::"KitLineMode", 0),
    ('M-16', 'מק פורק', 1, 'ALWAYS'::"KitLineMode", 1),
    ('M-16', 'רצועה', 1, 'ALWAYS'::"KitLineMode", 2),
    ('M-16', 'מטולון', 1, 'IF_ALLOCATED'::"KitLineMode", 3),
    ('M-16', 'מכפל', 1, 'IF_ALLOCATED'::"KitLineMode", 4),
    ('M-16', 'שחמ', 1, 'IF_ALLOCATED'::"KitLineMode", 5),
    ('M-16', 'שחע', 1, 'IF_ALLOCATED'::"KitLineMode", 6),
    ('M-16', 'ציין לייזר', 1, 'IF_ALLOCATED'::"KitLineMode", 7),
    ('M-16', 'עכבר', 1, 'IF_ALLOCATED'::"KitLineMode", 8),
    ('M-16', 'עידו', 1, 'IF_ALLOCATED'::"KitLineMode", 9),
    ('M-16', 'משקפת', 1, 'IF_ALLOCATED'::"KitLineMode", 10),
    ('M-16', 'מצפן', 1, 'IF_ALLOCATED'::"KitLineMode", 11),
    ('M-4 קלע', 'מחסנית', 5, 'ALWAYS'::"KitLineMode", 0),
    ('M-4 קלע', 'מק פורק', 1, 'ALWAYS'::"KitLineMode", 1),
    ('M-4 קלע', 'רצועה', 1, 'ALWAYS'::"KitLineMode", 2),
    ('M-4 קלע', 'מתפסים', 2, 'ALWAYS'::"KitLineMode", 3),
    ('M-4 קלע', 'דורגלים', 1, 'ALWAYS'::"KitLineMode", 4),
    ('M-4 קלע', 'מטולון', 1, 'IF_ALLOCATED'::"KitLineMode", 5),
    ('M-4 קלע', 'מכפל', 1, 'IF_ALLOCATED'::"KitLineMode", 6),
    ('M-4 קלע', 'טריג''יקון', 1, 'IF_ALLOCATED'::"KitLineMode", 7),
    ('M-4 קלע', 'אקילה X4', 1, 'IF_ALLOCATED'::"KitLineMode", 8),
    ('M-4 קלע', 'שחמ', 1, 'IF_ALLOCATED'::"KitLineMode", 9),
    ('M-4 קלע', 'שחע', 1, 'IF_ALLOCATED'::"KitLineMode", 10),
    ('M-4 קלע', 'ציין לייזר', 1, 'IF_ALLOCATED'::"KitLineMode", 11),
    ('M-4 קלע', 'עכבר', 1, 'IF_ALLOCATED'::"KitLineMode", 12),
    ('M-4 קלע', 'עידו', 1, 'IF_ALLOCATED'::"KitLineMode", 13),
    ('M-4 קלע', 'משקפת', 1, 'IF_ALLOCATED'::"KitLineMode", 14),
    ('M-4 קלע', 'מצפן', 1, 'IF_ALLOCATED'::"KitLineMode", 15),
    ('M-4 קלע סער', 'מחסנית', 5, 'ALWAYS'::"KitLineMode", 0),
    ('M-4 קלע סער', 'מק פורק', 1, 'ALWAYS'::"KitLineMode", 1),
    ('M-4 קלע סער', 'רצועה', 1, 'ALWAYS'::"KitLineMode", 2),
    ('M-4 קלע סער', 'דורגלים', 1, 'ALWAYS'::"KitLineMode", 3),
    ('M-4 קלע סער', 'מטולון', 1, 'IF_ALLOCATED'::"KitLineMode", 4),
    ('M-4 קלע סער', 'מכפל', 1, 'IF_ALLOCATED'::"KitLineMode", 5),
    ('M-4 קלע סער', 'טריג''יקון', 1, 'IF_ALLOCATED'::"KitLineMode", 6),
    ('M-4 קלע סער', 'אקילה X4', 1, 'IF_ALLOCATED'::"KitLineMode", 7),
    ('M-4 קלע סער', 'שחמ', 1, 'IF_ALLOCATED'::"KitLineMode", 8),
    ('M-4 קלע סער', 'שחע', 1, 'IF_ALLOCATED'::"KitLineMode", 9),
    ('M-4 קלע סער', 'ציין לייזר', 1, 'IF_ALLOCATED'::"KitLineMode", 10),
    ('M-4 קלע סער', 'עכבר', 1, 'IF_ALLOCATED'::"KitLineMode", 11),
    ('M-4 קלע סער', 'עידו', 1, 'IF_ALLOCATED'::"KitLineMode", 12),
    ('M-4 קלע סער', 'משקפת', 1, 'IF_ALLOCATED'::"KitLineMode", 13),
    ('M-4 קלע סער', 'מצפן', 1, 'IF_ALLOCATED'::"KitLineMode", 14),
    ('נגב', 'קנה ספייר לנגב', 1, 'ALWAYS'::"KitLineMode", 0),
    ('מטולון', 'M-203', 1, 'ALWAYS'::"KitLineMode", 0)
  ) AS t(base_name, line_name, quantity, mode, position) LOOP
    SELECT id INTO base_id FROM items WHERE name = r.base_name;
    SELECT id INTO item_id FROM items WHERE name = r.line_name;
    IF base_id IS NULL THEN
      RAISE NOTICE 'kit seed: base item "%" not in the catalog, kit skipped', r.base_name;
      CONTINUE;
    END IF;
    IF item_id IS NULL THEN
      RAISE NOTICE 'kit seed: line item "%" (kit of "%") not in the catalog, line skipped', r.line_name, r.base_name;
      CONTINUE;
    END IF;
    SELECT id INTO kit_id FROM item_kits WHERE base_item_id = base_id;
    IF kit_id IS NULL THEN
      kit_id := gen_random_uuid()::text;
      INSERT INTO item_kits (id, base_item_id, updated_at) VALUES (kit_id, base_id, now());
    END IF;
    INSERT INTO item_kit_lines (id, kit_id, item_id, quantity, mode, position)
    VALUES (gen_random_uuid()::text, kit_id, item_id, r.quantity, r.mode, r.position);
  END LOOP;

  -- The seed itself is the first history entry of every kit it created.
  INSERT INTO item_kit_changes (id, base_item_id, base_item_name, actor_name, before, after)
  SELECT gen_random_uuid()::text, k.base_item_id, bi.name, 'מערכת', '[]'::jsonb,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('itemName', li.name, 'quantity', l.quantity, 'mode', l.mode) ORDER BY l.position), '[]'::jsonb)
       FROM item_kit_lines l JOIN items li ON li.id = l.item_id WHERE l.kit_id = k.id)
  FROM item_kits k JOIN items bi ON bi.id = k.base_item_id;
END
$seed$;
