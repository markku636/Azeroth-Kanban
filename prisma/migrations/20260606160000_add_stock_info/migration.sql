-- 股票基本資料：代號 → 名稱 / 產業

-- CreateTable
CREATE TABLE "stock_info" (
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_info_pkey" PRIMARY KEY ("symbol")
);
