-- CreateTable
CREATE TABLE "schedule_run" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'schedule',
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "result" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "schedule_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_run_key_started_at_idx" ON "schedule_run"("key", "started_at");
