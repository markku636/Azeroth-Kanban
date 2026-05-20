-- CreateEnum
CREATE TYPE "MonitorKind" AS ENUM ('HTTP', 'TCP', 'KEYWORD', 'PUSH', 'LOG');

-- CreateEnum
CREATE TYPE "MonitorState" AS ENUM ('PENDING', 'UP', 'DOWN', 'PAUSED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "MonitorCheckResult" AS ENUM ('OK', 'FAIL', 'SKIPPED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "MonitorLogMode" AS ENUM ('ERROR_RATE', 'ERROR_COUNT', 'LATENCY_P99', 'KEYWORD');

-- CreateEnum
CREATE TYPE "NotificationChannelKind" AS ENUM ('SLACK_WEBHOOK', 'GENERIC_WEBHOOK', 'CONSOLE');

-- CreateTable
CREATE TABLE "monitors" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "MonitorKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'SEV3',
    "severity_ramp" JSONB,
    "auto_triage" BOOLEAN NOT NULL DEFAULT false,
    "failure_threshold" INTEGER NOT NULL DEFAULT 2,
    "re_alert_minutes" INTEGER NOT NULL DEFAULT 0,
    "incident_title_template" VARCHAR(300),
    "url" TEXT,
    "http_method" VARCHAR(10),
    "http_headers" JSONB,
    "http_body" TEXT,
    "expected_status_low" INTEGER NOT NULL DEFAULT 200,
    "expected_status_high" INTEGER NOT NULL DEFAULT 299,
    "body_keyword_include" VARCHAR(200),
    "body_keyword_exclude" VARCHAR(200),
    "timeout_ms" INTEGER NOT NULL DEFAULT 5000,
    "tcp_host" TEXT,
    "tcp_port" INTEGER,
    "push_token" VARCHAR(64),
    "push_timeout_seconds" INTEGER NOT NULL DEFAULT 600,
    "last_push_at" TIMESTAMP(3),
    "service" TEXT,
    "log_mode" "MonitorLogMode",
    "log_window_minutes" INTEGER NOT NULL DEFAULT 5,
    "log_level" VARCHAR(20) NOT NULL DEFAULT 'ERROR',
    "error_rate_threshold" DOUBLE PRECISION,
    "error_count_threshold" INTEGER,
    "latency_p99_threshold" INTEGER,
    "log_keyword" VARCHAR(200),
    "maintenance_until" TIMESTAMP(3),
    "tags" TEXT[],
    "group_name" VARCHAR(80),
    "depends_on_monitor_id" TEXT,
    "active_schedule" JSONB,
    "state" "MonitorState" NOT NULL DEFAULT 'PENDING',
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_checked_at" TIMESTAMP(3),
    "last_result" "MonitorCheckResult",
    "last_latency_ms" INTEGER,
    "last_magnitude" DOUBLE PRECISION,
    "open_incident_id" TEXT,
    "last_notified_at" TIMESTAMP(3),
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitor_checks" (
    "id" TEXT NOT NULL,
    "monitor_id" TEXT NOT NULL,
    "result" "MonitorCheckResult" NOT NULL,
    "magnitude" DOUBLE PRECISION,
    "latency_ms" INTEGER,
    "detail" VARCHAR(500),
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitor_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_windows" (
    "id" TEXT NOT NULL,
    "monitor_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "reason" VARCHAR(300),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "NotificationChannelKind" NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitor_channels" (
    "id" TEXT NOT NULL,
    "monitor_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "notify_on_down" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_recovery" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_re_alert" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "monitor_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monitors_name_key" ON "monitors"("name");

-- CreateIndex
CREATE INDEX "monitors_enabled_last_checked_at_idx" ON "monitors"("enabled", "last_checked_at");

-- CreateIndex
CREATE INDEX "monitors_owner_id_idx" ON "monitors"("owner_id");

-- CreateIndex
CREATE INDEX "monitors_kind_idx" ON "monitors"("kind");

-- CreateIndex
CREATE INDEX "monitor_checks_monitor_id_checked_at_idx" ON "monitor_checks"("monitor_id", "checked_at");

-- CreateIndex
CREATE INDEX "maintenance_windows_starts_at_ends_at_idx" ON "maintenance_windows"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "maintenance_windows_monitor_id_idx" ON "maintenance_windows"("monitor_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_channels_name_key" ON "notification_channels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "monitor_channels_monitor_id_channel_id_key" ON "monitor_channels"("monitor_id", "channel_id");

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_open_incident_id_fkey" FOREIGN KEY ("open_incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_depends_on_monitor_id_fkey" FOREIGN KEY ("depends_on_monitor_id") REFERENCES "monitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitor_checks" ADD CONSTRAINT "monitor_checks_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitor_channels" ADD CONSTRAINT "monitor_channels_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitor_channels" ADD CONSTRAINT "monitor_channels_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "notification_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
