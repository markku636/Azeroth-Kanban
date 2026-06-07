-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'ADX_TREND_START';
ALTER TYPE "AlertType" ADD VALUE 'BIAS_EXTREME_HIGH';
ALTER TYPE "AlertType" ADD VALUE 'BIAS_EXTREME_LOW';
ALTER TYPE "AlertType" ADD VALUE 'DIVERGENCE_BULLISH';
ALTER TYPE "AlertType" ADD VALUE 'DIVERGENCE_BEARISH';
ALTER TYPE "AlertType" ADD VALUE 'INSTITUTIONAL_STREAK';
ALTER TYPE "AlertType" ADD VALUE 'VALUATION_CHEAP';
ALTER TYPE "AlertType" ADD VALUE 'VALUATION_EXPENSIVE';

-- AlterTable
ALTER TABLE "analysis_signal" ADD COLUMN     "institutional_streak" INTEGER,
ADD COLUMN     "valuation_zone" TEXT;

-- CreateTable
CREATE TABLE "stock_institutional" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "foreign_net" INTEGER NOT NULL,
    "trust_net" INTEGER NOT NULL,
    "dealer_net" INTEGER NOT NULL,
    "total_net" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_institutional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_valuation_daily" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "close" DOUBLE PRECISION,
    "per" DOUBLE PRECISION,
    "pbr" DOUBLE PRECISION,
    "dividend_yield" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_valuation_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_institutional_symbol_trade_date_idx" ON "stock_institutional"("symbol", "trade_date");

-- CreateIndex
CREATE UNIQUE INDEX "stock_institutional_symbol_trade_date_key" ON "stock_institutional"("symbol", "trade_date");

-- CreateIndex
CREATE INDEX "stock_valuation_daily_symbol_trade_date_idx" ON "stock_valuation_daily"("symbol", "trade_date");

-- CreateIndex
CREATE UNIQUE INDEX "stock_valuation_daily_symbol_trade_date_key" ON "stock_valuation_daily"("symbol", "trade_date");
