CREATE TABLE "service_period_item_overrides" (
    "id" TEXT NOT NULL,
    "service_period_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "on_hand" INTEGER NOT NULL,
    CONSTRAINT "service_period_item_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_period_item_overrides_service_period_id_item_id_key"
    ON "service_period_item_overrides"("service_period_id", "item_id");

ALTER TABLE "service_period_item_overrides" ADD CONSTRAINT "service_period_item_overrides_service_period_id_fkey"
    FOREIGN KEY ("service_period_id") REFERENCES "service_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_period_item_overrides" ADD CONSTRAINT "service_period_item_overrides_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
