-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'logistics', 'viewer');

-- CreateEnum
CREATE TYPE "Company" AS ENUM ('א', 'ב', 'ג', 'מסייעת', 'מפקדה');

-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('נשק', 'אופטיקה', 'רחפן', 'ציוד');

-- CreateEnum
CREATE TYPE "InstanceStatus" AS ENUM ('תקין', 'תקול', 'מושבת');

-- CreateEnum
CREATE TYPE "MovementAction" AS ENUM ('ניפוק', 'זיכוי', 'יבוא');

-- CreateEnum
CREATE TYPE "CountShift" AS ENUM ('ערב', 'בוקר');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('נוכח', 'יציאה', 'חזרה', 'חופש', 'גימלים', 'צו סגור', 'אחר');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('ז', 'נ');

-- CreateEnum
CREATE TYPE "SnapshotKind" AS ENUM ('daily', 'pre-import', 'manual');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "company_scope" "Company",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soldiers" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "personal_number" TEXT,
    "phone" TEXT,
    "company" "Company" NOT NULL,
    "platoon" TEXT,
    "receipt_no" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "soldiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "full_name" TEXT,
    "personal_number" TEXT,
    "gender" "Gender" NOT NULL DEFAULT 'ז',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" "ItemCategory" NOT NULL,
    "catalog_no" TEXT,
    "is_serialized" BOOLEAN NOT NULL DEFAULT true,
    "authorized_qty" INTEGER NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_instances" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "status" "InstanceStatus" NOT NULL DEFAULT 'תקין',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatures" (
    "id" TEXT NOT NULL,
    "soldier_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "item_instance_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "receipt_no" TEXT,
    "notes" TEXT,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signed_by_user_id" TEXT NOT NULL,
    "returned_at" TIMESTAMP(3),
    "returned_by_user_id" TEXT,

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movements" (
    "id" TEXT NOT NULL,
    "action" "MovementAction" NOT NULL,
    "soldier_id" TEXT,
    "soldier_name_snapshot" TEXT NOT NULL,
    "company_snapshot" "Company",
    "item_id" TEXT,
    "item_name_snapshot" TEXT NOT NULL,
    "serial_snapshot" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "receipt_no" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performed_by_user_id" TEXT,
    "performed_by_name_snapshot" TEXT NOT NULL,
    "notes" TEXT,
    "signature_id" TEXT,

    CONSTRAINT "movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocations" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "company" "Company" NOT NULL,
    "target_qty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "count_sessions" (
    "id" TEXT NOT NULL,
    "session_date" DATE NOT NULL,
    "shift" "CountShift" NOT NULL,
    "responsible_name" TEXT,
    "responsible_pn" TEXT,
    "responsible_rank" TEXT,
    "officer_name" TEXT,
    "officer_pn" TEXT,
    "officer_rank" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_user_id" TEXT NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "count_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "count_lines" (
    "id" TEXT NOT NULL,
    "count_session_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "counted_qty" INTEGER NOT NULL DEFAULT 0,
    "faulty_qty" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "team_member_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshots" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "SnapshotKind" NOT NULL,
    "file_path" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "slack_sent_at" TIMESTAMP(3),
    "slack_error" TEXT,
    "created_by_user_id" TEXT,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "soldiers_personal_number_key" ON "soldiers"("personal_number");

-- CreateIndex
CREATE INDEX "soldiers_last_name_first_name_idx" ON "soldiers"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "soldiers_company_idx" ON "soldiers"("company");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_nickname_key" ON "team_members"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "items_name_key" ON "items"("name");

-- CreateIndex
CREATE INDEX "item_instances_serial_idx" ON "item_instances"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "item_instances_item_id_serial_key" ON "item_instances"("item_id", "serial");

-- CreateIndex
CREATE INDEX "signatures_soldier_id_idx" ON "signatures"("soldier_id");

-- CreateIndex
CREATE INDEX "signatures_item_id_idx" ON "signatures"("item_id");

-- CreateIndex
CREATE INDEX "signatures_returned_at_idx" ON "signatures"("returned_at");

-- CreateIndex
CREATE INDEX "movements_occurred_at_idx" ON "movements"("occurred_at");

-- CreateIndex
CREATE INDEX "movements_action_idx" ON "movements"("action");

-- CreateIndex
CREATE INDEX "movements_soldier_id_idx" ON "movements"("soldier_id");

-- CreateIndex
CREATE INDEX "movements_item_id_idx" ON "movements"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "allocations_item_id_company_key" ON "allocations"("item_id", "company");

-- CreateIndex
CREATE UNIQUE INDEX "count_sessions_session_date_shift_key" ON "count_sessions"("session_date", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "count_lines_count_session_id_item_id_key" ON "count_lines"("count_session_id", "item_id");

-- CreateIndex
CREATE INDEX "attendance_date_idx" ON "attendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_team_member_id_date_key" ON "attendance"("team_member_id", "date");

-- CreateIndex
CREATE INDEX "snapshots_created_at_idx" ON "snapshots"("created_at");

-- AddForeignKey
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_soldier_id_fkey" FOREIGN KEY ("soldier_id") REFERENCES "soldiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_item_instance_id_fkey" FOREIGN KEY ("item_instance_id") REFERENCES "item_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_signed_by_user_id_fkey" FOREIGN KEY ("signed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_returned_by_user_id_fkey" FOREIGN KEY ("returned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_soldier_id_fkey" FOREIGN KEY ("soldier_id") REFERENCES "soldiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "signatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "count_sessions" ADD CONSTRAINT "count_sessions_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "count_lines" ADD CONSTRAINT "count_lines_count_session_id_fkey" FOREIGN KEY ("count_session_id") REFERENCES "count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "count_lines" ADD CONSTRAINT "count_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
