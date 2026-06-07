-- 基本面 + 評分：新增 stock_fundamental 表 + analysis_signal 加 score 欄位

-- AlterTable
ALTER TABLE "analysis_signal" ADD COLUMN "score" INTEGER;
ALTER TABLE "analysis_signal" ADD COLUMN "score_detail" JSONB;

-- CreateTable
CREATE TABLE "stock_fundamental" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "revenue_period" TEXT,
    "revenue" BIGINT,
    "revenue_yoy" DOUBLE PRECISION,
    "revenue_mom" DOUBLE PRECISION,
    "eps" DOUBLE PRECISION,
    "per" DOUBLE PRECISION,
    "pbr" DOUBLE PRECISION,
    "dividend_yield" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_fundamental_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_fundamental_symbol_key" ON "stock_fundamental"("symbol");
