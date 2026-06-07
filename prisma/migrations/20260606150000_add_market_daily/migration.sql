-- 大盤 / 類股輪動：每日一筆

-- CreateTable
CREATE TABLE "market_daily" (
    "date" TIMESTAMP(3) NOT NULL,
    "taiex_open" DOUBLE PRECISION,
    "taiex_high" DOUBLE PRECISION,
    "taiex_low" DOUBLE PRECISION,
    "taiex_close" DOUBLE PRECISION,
    "taiex_change_pct" DOUBLE PRECISION,
    "advancers" INTEGER,
    "decliners" INTEGER,
    "unchanged" INTEGER,
    "sectors" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_daily_pkey" PRIMARY KEY ("date")
);
