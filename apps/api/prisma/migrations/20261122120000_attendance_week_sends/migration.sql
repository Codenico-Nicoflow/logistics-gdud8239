CREATE TABLE "attendance_week_sends" (
    "id" TEXT NOT NULL,
    "week_start" DATE NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT NOT NULL,
    "sent_by" TEXT,
    "cron_key" TEXT,
    "error" TEXT,
    CONSTRAINT "attendance_week_sends_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_week_sends_cron_key_key" ON "attendance_week_sends"("cron_key");
CREATE INDEX "attendance_week_sends_week_start_idx" ON "attendance_week_sends"("week_start");
