-- CreateTable
CREATE TABLE "count_session_figures" (
    "id" TEXT NOT NULL,
    "count_session_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "nashkiya_qty" INTEGER,

    CONSTRAINT "count_session_figures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "count_session_figures_count_session_id_item_id_key" ON "count_session_figures"("count_session_id", "item_id");

-- AddForeignKey
ALTER TABLE "count_session_figures" ADD CONSTRAINT "count_session_figures_count_session_id_fkey" FOREIGN KEY ("count_session_id") REFERENCES "count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "count_session_figures" ADD CONSTRAINT "count_session_figures_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
