-- CreateTable
CREATE TABLE "count_session_reopens" (
    "id" TEXT NOT NULL,
    "count_session_id" TEXT NOT NULL,
    "reopened_by_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reopened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "count_session_reopens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "count_session_reopens_count_session_id_idx" ON "count_session_reopens"("count_session_id");

-- AddForeignKey
ALTER TABLE "count_session_reopens" ADD CONSTRAINT "count_session_reopens_count_session_id_fkey" FOREIGN KEY ("count_session_id") REFERENCES "count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "count_session_reopens" ADD CONSTRAINT "count_session_reopens_reopened_by_user_id_fkey" FOREIGN KEY ("reopened_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
