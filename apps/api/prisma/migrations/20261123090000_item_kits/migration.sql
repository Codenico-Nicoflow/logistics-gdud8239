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

-- One-time seed of the always-together rules that were hardcoded in issue-bundle-rules.ts (the optional
-- optics were never kit: a soldier gets those through his allocation), matched on the exact
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
    ('M-4', 'מחסנית', 5, 0),
    ('M-4', 'מק פורק', 1, 1),
    ('M-4', 'רצועה', 1, 2),
    ('M-4', 'מתפסים', 3, 3),
    ('M-16', 'מחסנית', 5, 0),
    ('M-16', 'מק פורק', 1, 1),
    ('M-16', 'רצועה', 1, 2),
    ('M-4 קלע', 'מחסנית', 5, 0),
    ('M-4 קלע', 'מק פורק', 1, 1),
    ('M-4 קלע', 'רצועה', 1, 2),
    ('M-4 קלע', 'מתפסים', 2, 3),
    ('M-4 קלע', 'דורגלים', 1, 4),
    ('M-4 קלע סער', 'מחסנית', 5, 0),
    ('M-4 קלע סער', 'מק פורק', 1, 1),
    ('M-4 קלע סער', 'רצועה', 1, 2),
    ('M-4 קלע סער', 'דורגלים', 1, 3),
    ('נגב', 'קנה ספייר לנגב', 1, 0),
    ('מטולון', 'M-203', 1, 0)
  ) AS t(base_name, line_name, quantity, position) LOOP
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
    INSERT INTO item_kit_lines (id, kit_id, item_id, quantity, position)
    VALUES (gen_random_uuid()::text, kit_id, item_id, r.quantity, r.position);
  END LOOP;

  -- The seed itself is the first history entry of every kit it created.
  INSERT INTO item_kit_changes (id, base_item_id, base_item_name, actor_name, before, after)
  SELECT gen_random_uuid()::text, k.base_item_id, bi.name, 'מערכת', '[]'::jsonb,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('itemName', li.name, 'quantity', l.quantity) ORDER BY l.position), '[]'::jsonb)
       FROM item_kit_lines l JOIN items li ON li.id = l.item_id WHERE l.kit_id = k.id)
  FROM item_kits k JOIN items bi ON bi.id = k.base_item_id;
END
$seed$;
