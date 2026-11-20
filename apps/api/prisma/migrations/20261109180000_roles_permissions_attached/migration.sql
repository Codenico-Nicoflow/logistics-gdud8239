-- CreateEnum
CREATE TYPE "PermissionLevel" AS ENUM ('אין', 'צפייה', 'עריכה');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'שלישות';
ALTER TYPE "Role" ADD VALUE 'סמג"ד';
ALTER TYPE "Role" ADD VALUE 'מ"פ';

-- AlterTable
ALTER TABLE "soldiers" ADD COLUMN     "is_attached" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "key" TEXT NOT NULL,
    "level" "PermissionLevel" NOT NULL DEFAULT 'אין',

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_key_key" ON "role_permissions"("role", "key");

