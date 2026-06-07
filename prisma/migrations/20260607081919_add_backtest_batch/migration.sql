-- AlterTable
ALTER TABLE "backtest_run" ADD COLUMN     "batch_id" TEXT,
ADD COLUMN     "engine_version" INTEGER;

-- CreateTable
CREATE TABLE "backtest_batch" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "common" JSONB NOT NULL,
    "entries" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "global_start_date" TEXT,
    "buy_hold_pct" DOUBLE PRECISION,
    "buy_hold_curve" JSONB,
    "champion_run_id" TEXT,
    "params_hash" TEXT,
    "engine_version" INTEGER,
    "created_by_id" TEXT,
    "error" TEXT,
    "job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backtest_batch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backtest_batch_symbol_created_at_idx" ON "backtest_batch"("symbol", "created_at");

-- CreateIndex
CREATE INDEX "backtest_run_batch_id_idx" ON "backtest_run"("batch_id");

-- CreateIndex
CREATE INDEX "backtest_run_strategy_created_at_idx" ON "backtest_run"("strategy", "created_at");

-- AddForeignKey
ALTER TABLE "backtest_run" ADD CONSTRAINT "backtest_run_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "backtest_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
