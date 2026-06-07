-- 籌碼面：AlertType 新增 2 值 + stock_chip 資料表

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'MARGIN_DROP';
ALTER TYPE "AlertType" ADD VALUE 'FOREIGN_RATIO_UP';

-- CreateTable
CREATE TABLE "stock_chip" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "trade_date" DATE NOT NULL,
    "margin_balance" INTEGER NOT NULL,
    "short_balance" INTEGER NOT NULL,
    "foreign_ratio" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_chip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_chip_symbol_trade_date_idx" ON "stock_chip"("symbol", "trade_date");

-- CreateIndex
CREATE UNIQUE INDEX "stock_chip_symbol_trade_date_key" ON "stock_chip"("symbol", "trade_date");
