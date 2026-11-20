CREATE TABLE "soldier_allocations_v2" (
    "id" TEXT NOT NULL,
    "service_period_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "soldier_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "soldier_allocations_v2_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "soldier_allocations_v2_service_period_id_item_id_soldier_i_key"
    ON "soldier_allocations_v2"("service_period_id", "item_id", "soldier_id");

ALTER TABLE "soldier_allocations_v2" ADD CONSTRAINT "soldier_allocations_v2_service_period_id_fkey"
    FOREIGN KEY ("service_period_id") REFERENCES "service_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "soldier_allocations_v2" ADD CONSTRAINT "soldier_allocations_v2_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "soldier_allocations_v2" ADD CONSTRAINT "soldier_allocations_v2_soldier_id_fkey"
    FOREIGN KEY ("soldier_id") REFERENCES "soldiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
