-- CreateTable
CREATE TABLE "backtest_run" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'kd',
    "params" JSONB NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "initial_capital" DOUBLE PRECISION,
    "final_capital" DOUBLE PRECISION,
    "total_return_pct" DOUBLE PRECISION,
    "annualized_pct" DOUBLE PRECISION,
    "win_rate" DOUBLE PRECISION,
    "total_trades" INTEGER,
    "max_drawdown_pct" DOUBLE PRECISION,
    "profit_factor" DOUBLE PRECISION,
    "buy_hold_pct" DOUBLE PRECISION,
    "stats" JSONB,
    "equity_curve" JSONB,
    "trades" JSONB,
    "error" TEXT,
    "job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backtest_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backtest_run_symbol_created_at_idx" ON "backtest_run"("symbol", "created_at");
