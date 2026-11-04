-- DropForeignKey
ALTER TABLE "movements" DROP CONSTRAINT "movements_item_id_fkey";

-- DropForeignKey
ALTER TABLE "movements" DROP CONSTRAINT "movements_performed_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "movements" DROP CONSTRAINT "movements_signature_id_fkey";

-- DropForeignKey
ALTER TABLE "movements" DROP CONSTRAINT "movements_soldier_id_fkey";

-- DropForeignKey
ALTER TABLE "signatures" DROP CONSTRAINT "signatures_soldier_id_fkey";

-- AlterTable
ALTER TABLE "soldiers" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_soldier_id_fkey" FOREIGN KEY ("soldier_id") REFERENCES "soldiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_soldier_id_fkey" FOREIGN KEY ("soldier_id") REFERENCES "soldiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
