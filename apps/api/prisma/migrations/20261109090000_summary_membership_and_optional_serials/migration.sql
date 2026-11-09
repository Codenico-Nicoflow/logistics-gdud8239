-- Which items appear in מסכם, and the ספירת נשקיה sheet derived from it.
-- The catalog carries entries nobody counts nightly (priced gear, zero-stock
-- spares), and listing all of them made the count sheet unusable.
ALTER TABLE "items" ADD COLUMN "in_summary" BOOLEAN NOT NULL DEFAULT true;

-- Default to the items the armory actually holds: anything with a מצבה, or
-- anything currently signed out. Priced gear is excluded — it is v2's module.
UPDATE "items" SET "in_summary" = false
WHERE "category" = 'ציוד'
  AND "authorized_qty" = 0
  AND "id" NOT IN (SELECT DISTINCT "item_id" FROM "signatures" WHERE "returned_at" IS NULL);

-- מק"ט is not used by the battalion; drop it rather than carry a dead column.
ALTER TABLE "items" DROP COLUMN "catalog_no";

-- A serial is now allowed on any item, not only one flagged as serialized:
-- in practice staff do record a מסד for items the catalog calls bulk. What
-- `is_serialized` still guarantees is the reverse — a serialized item cannot
-- be signed out WITHOUT a serial (enforced in the application layer).
-- The one-active-holder-per-instance index is unchanged and still applies to
-- every instance, however its item is flagged.
