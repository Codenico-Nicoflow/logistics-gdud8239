-- CreateTable
CREATE TABLE "count_session_deletions" (
    "id" TEXT NOT NULL,
    "session_date" DATE NOT NULL,
    "shift" "CountShift" NOT NULL,
    "responsible_name" TEXT,
    "officer_name" TEXT,
    "deleted_by_name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "count_session_deletions_pkey" PRIMARY KEY ("id")
);
