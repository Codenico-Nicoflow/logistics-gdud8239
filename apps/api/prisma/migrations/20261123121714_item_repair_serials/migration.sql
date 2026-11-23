-- AlterTable
ALTER TABLE "items" ADD COLUMN     "repair_serials" TEXT[] DEFAULT ARRAY[]::TEXT[];
