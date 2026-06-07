-- 排程設定：使用者覆寫 BullMQ Job Scheduler 的時間 / 啟用

-- CreateTable
CREATE TABLE "schedule_config" (
    "key" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_config_pkey" PRIMARY KEY ("key")
);
