-- 股票 AI 機器人：新增資料表（純新增，不影響既有資料）

-- CreateEnum
CREATE TYPE "SignalAction" AS ENUM ('BUY', 'SELL', 'HOLD');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "watchlist" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_daily_price" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'finmind',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_daily_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_signal" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "action" "SignalAction" NOT NULL DEFAULT 'HOLD',
    "entry_zone" TEXT,
    "stop_loss" DOUBLE PRECISION,
    "take_profit" DOUBLE PRECISION,
    "timing_note" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rationale" TEXT,
    "patterns" JSONB,
    "indicators" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_report" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "report_date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sources" JSONB,
    "sentiment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_run" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "job_id" TEXT,
    "symbol" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_subscriber" (
    "id" TEXT NOT NULL,
    "line_user_id" TEXT NOT NULL,
    "member_id" TEXT,
    "display_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "watchlist_is_active_idx" ON "watchlist"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_member_id_symbol_key" ON "watchlist"("member_id", "symbol");

-- CreateIndex
CREATE INDEX "stock_daily_price_symbol_trade_date_idx" ON "stock_daily_price"("symbol", "trade_date");

-- CreateIndex
CREATE UNIQUE INDEX "stock_daily_price_symbol_trade_date_key" ON "stock_daily_price"("symbol", "trade_date");

-- CreateIndex
CREATE INDEX "analysis_signal_symbol_created_at_idx" ON "analysis_signal"("symbol", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_signal_symbol_trade_date_key" ON "analysis_signal"("symbol", "trade_date");

-- CreateIndex
CREATE INDEX "research_report_symbol_created_at_idx" ON "research_report"("symbol", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "research_report_symbol_report_date_key" ON "research_report"("symbol", "report_date");

-- CreateIndex
CREATE INDEX "analysis_run_type_status_idx" ON "analysis_run"("type", "status");

-- CreateIndex
CREATE INDEX "analysis_run_symbol_created_at_idx" ON "analysis_run"("symbol", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "line_subscriber_line_user_id_key" ON "line_subscriber"("line_user_id");

-- CreateIndex
CREATE INDEX "line_subscriber_is_active_idx" ON "line_subscriber"("is_active");

-- AddForeignKey
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_subscriber" ADD CONSTRAINT "line_subscriber_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
