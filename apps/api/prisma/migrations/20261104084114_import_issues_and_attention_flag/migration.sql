-- CreateEnum
CREATE TYPE "IssueKind" AS ENUM ('חסר מסד', 'מסד כפול', 'פריט לא מזוהה', 'פלוגה לא מזוהה', 'חסר שם חייל', 'שורה כפולה');

-- AlterTable
ALTER TABLE "signatures" ADD COLUMN     "needs_attention" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "import_issues" (
    "id" TEXT NOT NULL,
    "kind" "IssueKind" NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_row" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "signature_id" TEXT,
    "soldier_id" TEXT,
    "item_id" TEXT,
    "serial" TEXT,
    "resolved_at" TIMESTAMP(3),
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_issues_kind_idx" ON "import_issues"("kind");

-- CreateIndex
CREATE INDEX "import_issues_resolved_at_idx" ON "import_issues"("resolved_at");

-- CreateIndex
CREATE INDEX "signatures_needs_attention_idx" ON "signatures"("needs_attention");
