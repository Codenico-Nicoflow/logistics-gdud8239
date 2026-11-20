-- CreateEnum
CREATE TYPE "DbBackupKind" AS ENUM ('daily', 'manual');

-- CreateTable
CREATE TABLE "db_backups" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "DbBackupKind" NOT NULL,
    "file_path" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "slack_sent_at" TIMESTAMP(3),
    "slack_error" TEXT,
    "created_by_user_id" TEXT,

    CONSTRAINT "db_backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "db_backups_created_at_idx" ON "db_backups"("created_at");

-- AddForeignKey
ALTER TABLE "db_backups" ADD CONSTRAINT "db_backups_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
