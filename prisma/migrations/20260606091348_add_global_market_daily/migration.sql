-- CreateTable
CREATE TABLE "global_market_daily" (
    "date" TIMESTAMP(3) NOT NULL,
    "us_indices" JSONB,
    "txf_night_close" DOUBLE PRECISION,
    "txf_night_change_pct" DOUBLE PRECISION,
    "txf_night_change_point" DOUBLE PRECISION,
    "txf_basis" DOUBLE PRECISION,
    "fut_chips" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_market_daily_pkey" PRIMARY KEY ("date")
);
