-- CreateTable
CREATE TABLE "daily_summary_lines" (
    "id" TEXT NOT NULL,
    "session_date" DATE NOT NULL,
    "item_id" TEXT NOT NULL,
    "nashkiya_qty" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,

    CONSTRAINT "daily_summary_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_summary_exports" (
    "id" TEXT NOT NULL,
    "session_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slack_sent_at" TIMESTAMP(3),
    "slack_error" TEXT,

    CONSTRAINT "daily_summary_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_summary_lines_session_date_item_id_key" ON "daily_summary_lines"("session_date", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_summary_exports_session_date_key" ON "daily_summary_exports"("session_date");

-- AddForeignKey
ALTER TABLE "daily_summary_lines" ADD CONSTRAINT "daily_summary_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_summary_lines" ADD CONSTRAINT "daily_summary_lines_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
