-- דוח תנועות records weapon movements only: a soldier is given an item (ניפוק)
-- or returns one (זיכוי). Excel imports were previously written here as a third
-- action, which diluted the report with rows that are not weapon movements;
-- they now go to `import_logs` instead.

ALTER TABLE "movements" DISABLE TRIGGER USER;
DELETE FROM "movements" WHERE "action" = 'יבוא';
ALTER TABLE "movements" ENABLE TRIGGER USER;

ALTER TYPE "MovementAction" RENAME TO "MovementAction_old";
CREATE TYPE "MovementAction" AS ENUM ('ניפוק', 'זיכוי');
ALTER TABLE "movements"
  ALTER COLUMN "action" TYPE "MovementAction"
  USING ("action"::text::"MovementAction");
DROP TYPE "MovementAction_old";

CREATE TABLE "import_logs" (
    "id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_name" TEXT,
    "total_rows" INTEGER NOT NULL,
    "signatures" INTEGER NOT NULL,
    "soldiers" INTEGER NOT NULL,
    "flagged" INTEGER NOT NULL,
    "issues" INTEGER NOT NULL,
    "snapshot_id" TEXT,
    "performed_by_user_id" TEXT,
    "performed_by_name_snapshot" TEXT NOT NULL,
    "notes" TEXT,
    CONSTRAINT "import_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_logs_occurred_at_idx" ON "import_logs"("occurred_at");

ALTER TABLE "import_logs"
  ADD CONSTRAINT "import_logs_performed_by_user_id_fkey"
  FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
