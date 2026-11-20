CREATE TABLE "soldier_enlistments" (
    "id" TEXT NOT NULL,
    "soldier_id" TEXT NOT NULL,
    "service_period_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "soldier_enlistments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "soldier_enlistments_soldier_id_service_period_id_key"
    ON "soldier_enlistments"("soldier_id", "service_period_id");

ALTER TABLE "soldier_enlistments" ADD CONSTRAINT "soldier_enlistments_soldier_id_fkey"
    FOREIGN KEY ("soldier_id") REFERENCES "soldiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "soldier_enlistments" ADD CONSTRAINT "soldier_enlistments_service_period_id_fkey"
    FOREIGN KEY ("service_period_id") REFERENCES "service_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
