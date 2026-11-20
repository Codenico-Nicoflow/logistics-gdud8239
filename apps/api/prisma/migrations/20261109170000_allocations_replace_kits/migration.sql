-- CreateEnum
CREATE TYPE "ServicePeriodStatus" AS ENUM ('תכנון', 'פעילה', 'סגורה');

-- DropForeignKey
ALTER TABLE "kit_lines" DROP CONSTRAINT "kit_lines_item_id_fkey";

-- DropForeignKey
ALTER TABLE "kit_lines" DROP CONSTRAINT "kit_lines_kit_id_fkey";

-- DropTable
DROP TABLE "kit_lines";

-- DropTable
DROP TABLE "kits";

-- CreateTable
CREATE TABLE "service_periods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "starts_at" DATE NOT NULL,
    "ends_at" DATE NOT NULL,
    "status" "ServicePeriodStatus" NOT NULL DEFAULT 'תכנון',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battalion_allocations" (
    "id" TEXT NOT NULL,
    "service_period_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "authorized_qty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "battalion_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soldier_allocations" (
    "id" TEXT NOT NULL,
    "service_period_id" TEXT NOT NULL,
    "soldier_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "serial" TEXT,
    "assigned_by_user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "override_flag" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "soldier_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "battalion_allocations_service_period_id_item_id_key" ON "battalion_allocations"("service_period_id", "item_id");

-- CreateIndex
CREATE INDEX "soldier_allocations_service_period_id_item_id_idx" ON "soldier_allocations"("service_period_id", "item_id");

-- CreateIndex
CREATE INDEX "soldier_allocations_soldier_id_idx" ON "soldier_allocations"("soldier_id");

-- CreateIndex
CREATE UNIQUE INDEX "soldier_allocations_service_period_id_soldier_id_item_id_key" ON "soldier_allocations"("service_period_id", "soldier_id", "item_id");

-- AddForeignKey
ALTER TABLE "battalion_allocations" ADD CONSTRAINT "battalion_allocations_service_period_id_fkey" FOREIGN KEY ("service_period_id") REFERENCES "service_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battalion_allocations" ADD CONSTRAINT "battalion_allocations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soldier_allocations" ADD CONSTRAINT "soldier_allocations_service_period_id_fkey" FOREIGN KEY ("service_period_id") REFERENCES "service_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soldier_allocations" ADD CONSTRAINT "soldier_allocations_soldier_id_fkey" FOREIGN KEY ("soldier_id") REFERENCES "soldiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soldier_allocations" ADD CONSTRAINT "soldier_allocations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soldier_allocations" ADD CONSTRAINT "soldier_allocations_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

