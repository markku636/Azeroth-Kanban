-- 警報引擎：新增 alert 資料表（純新增）

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('PRICE_ABOVE', 'PRICE_BELOW', 'RSI_ABOVE', 'RSI_BELOW');

-- CreateTable
CREATE TABLE "alert" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_triggered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_symbol_is_active_idx" ON "alert"("symbol", "is_active");

-- CreateIndex
CREATE INDEX "alert_member_id_idx" ON "alert"("member_id");

-- AddForeignKey
ALTER TABLE "alert" ADD CONSTRAINT "alert_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
