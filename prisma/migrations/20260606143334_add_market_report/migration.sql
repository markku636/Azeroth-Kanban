-- CreateTable
CREATE TABLE "market_report" (
    "id" TEXT NOT NULL,
    "report_date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentiment" TEXT,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "market_report_report_date_key" ON "market_report"("report_date");

-- CreateIndex
CREATE INDEX "market_report_created_at_idx" ON "market_report"("created_at");
