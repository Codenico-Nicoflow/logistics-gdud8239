/*
  Warnings:

  - You are about to drop the `webauthn_challenges` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `webauthn_credentials` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "webauthn_challenges" DROP CONSTRAINT "webauthn_challenges_user_id_fkey";

-- DropForeignKey
ALTER TABLE "webauthn_credentials" DROP CONSTRAINT "webauthn_credentials_user_id_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfa_exempt" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "webauthn_challenges";

-- DropTable
DROP TABLE "webauthn_credentials";

-- CreateTable
CREATE TABLE "user_totp" (
    "user_id" TEXT NOT NULL,
    "secret_enc" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "last_step" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_totp_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "totp_backup_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "totp_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "totp_backup_codes_user_id_code_hash_key" ON "totp_backup_codes"("user_id", "code_hash");

-- AddForeignKey
ALTER TABLE "user_totp" ADD CONSTRAINT "user_totp_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "totp_backup_codes" ADD CONSTRAINT "totp_backup_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_totp"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
