-- Drop per-soldier pre-assignment (and its 1008 pre-fill); samgad now
-- allocates straight to companies, not individual soldiers.
DROP TABLE IF EXISTS "soldier_allocations";

-- Replace the single battalion-wide cap with one row per (period, item, company).
DROP TABLE IF EXISTS "battalion_allocations";

CREATE TABLE "company_allocations" (
    "id" TEXT NOT NULL,
    "service_period_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "company" "Company" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "company_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_allocations_service_period_id_item_id_company_key"
    ON "company_allocations"("service_period_id", "item_id", "company");

ALTER TABLE "company_allocations"
    ADD CONSTRAINT "company_allocations_service_period_id_fkey"
    FOREIGN KEY ("service_period_id") REFERENCES "service_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_allocations"
    ADD CONSTRAINT "company_allocations_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
