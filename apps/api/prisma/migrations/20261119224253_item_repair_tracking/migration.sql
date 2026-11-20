-- AlterEnum
ALTER TYPE "InstanceStatus" ADD VALUE 'בתיקון';

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "repair_qty" INTEGER NOT NULL DEFAULT 0;

-- RenameIndex
ALTER INDEX "soldier_allocations_v2_service_period_id_item_id_soldier_i_key" RENAME TO "soldier_allocations_v2_service_period_id_item_id_soldier_id_key";
