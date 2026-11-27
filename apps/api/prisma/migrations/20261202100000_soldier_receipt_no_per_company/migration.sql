-- The number on the shelf note of a soldier's personal weapon (מספר קבלה) belongs to one soldier of a company
-- at a time: each company numbers its own, so 1-100 in פלוגה א and 1-100 in פלוגה ב can both exist.
-- Enforced in the database so two soldiers can never end up with the same note on the shelf.

-- Blank or padded values would sit outside the rule, so they are normalised first.
UPDATE "soldiers" SET "receipt_no" = NULLIF(btrim("receipt_no"), '') WHERE "receipt_no" IS DISTINCT FROM NULLIF(btrim("receipt_no"), '');

CREATE UNIQUE INDEX "soldiers_receipt_no_per_company"
  ON "soldiers" ("battalion_id", "company", "receipt_no")
  WHERE "receipt_no" IS NOT NULL;
