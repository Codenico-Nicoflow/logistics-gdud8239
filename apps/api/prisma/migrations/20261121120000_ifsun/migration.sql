ALTER TYPE "MovementAction" ADD VALUE 'אופסן';
ALTER TYPE "MovementAction" ADD VALUE 'נלקח מאפסון';

CREATE TYPE "IfsunStatus" AS ENUM ('מאופסן', 'נלקח', 'זוכה');

CREATE TABLE "ifsun_records" (
    "id" TEXT NOT NULL,
    "signature_id" TEXT NOT NULL,
    "soldier_id" TEXT NOT NULL,
    "soldier_name_snapshot" TEXT NOT NULL,
    "company_snapshot" "Company",
    "item_id" TEXT NOT NULL,
    "item_name_snapshot" TEXT NOT NULL,
    "serial_snapshot" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "IfsunStatus" NOT NULL DEFAULT 'מאופסן',
    "notes" TEXT,
    "stored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stored_by_user_id" TEXT NOT NULL,
    "stored_by_name" TEXT NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by_name" TEXT,
    "close_notes" TEXT,
    CONSTRAINT "ifsun_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ifsun_records_status_idx" ON "ifsun_records"("status");
CREATE INDEX "ifsun_records_signature_id_idx" ON "ifsun_records"("signature_id");
CREATE INDEX "ifsun_records_soldier_id_idx" ON "ifsun_records"("soldier_id");
ALTER TABLE "ifsun_records" ADD CONSTRAINT "ifsun_records_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "signatures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
