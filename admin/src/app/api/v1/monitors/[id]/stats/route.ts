/**
 * GET /api/v1/monitors/[id]/stats —— 監控統計(供詳情頁卡片 + 心跳條)。
 *
 * 回傳:
 *   - uptime: 24h / 7d / 30d 內 OK / 全部(扣除 MAINTENANCE / SKIPPED)的比例。
 *   - latency: 24h 內 OK 檢查的 avg / p95(只算有 latencyMs 的)。
 *   - recentChecks: 最近 50 筆(供 heartbeat bar)。
 *
 * 由於 MonitorCheck 已修剪到 ~500 筆,直接 in-process 計算就足夠。
 */
import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { PERMISSIONS } from '@/config/permissions';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/with-permission';

type RouteCtx = { params: Promise<Record<string, string>> };

interface MonitorStats {
  uptime: { '24h': number | null; '7d': number | null; '30d': number | null };
  latency: { avgMs: number | null; p95Ms: number | null };
  recentChecks: Array<{
    id: string;
    result: string;
    magnitude: number | null;
    latencyMs: number | null;
    detail: string | null;
    checkedAt: Date;
  }>;
  totalChecks: number;
}

function uptimePct(checks: Array<{ result: string }>): number | null {
  const considered = checks.filter((c) => c.result === 'OK' || c.result === 'FAIL');
  if (considered.length === 0) return null;
  const ok = considered.filter((c) => c.result === 'OK').length;
  return (ok / considered.length) * 100;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] ?? 0;
}

export const GET = withPermission(
  PERMISSIONS.MONITORS_VIEW,
  async (_request: NextRequest, { params }: RouteCtx) => {
    const session = await auth();
    if (!session?.user?.memberId) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    }
    const { id } = await params;
    try {
      const monitor = await prisma.monitor.findUnique({ where: { id }, select: { id: true } });
      if (!monitor) return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '找不到監控');

      const now = Date.now();
      const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const since24h = new Date(now - 24 * 60 * 60 * 1000);

      // 一次撈 30d 的歷史,再分段過濾(避免三次查詢)
      const checks = await prisma.monitorCheck.findMany({
        where: { monitorId: id, checkedAt: { gte: since30d } },
        orderBy: { checkedAt: 'desc' },
        select: { id: true, result: true, magnitude: true, latencyMs: true, detail: true, checkedAt: true },
        take: 1500,
      });

      const checks24h = checks.filter((c) => c.checkedAt >= since24h);
      const checks7d = checks.filter((c) => c.checkedAt >= since7d);
      const latencies24h = checks24h
        .filter((c) => c.result === 'OK' && typeof c.latencyMs === 'number' && c.latencyMs! >= 0)
        .map((c) => c.latencyMs as number);

      const avgMs =
        latencies24h.length > 0 ? Math.round(latencies24h.reduce((a, b) => a + b, 0) / latencies24h.length) : null;
      const p95Ms = latencies24h.length > 0 ? Math.round(percentile(latencies24h, 95)) : null;

      const stats: MonitorStats = {
        uptime: {
          '24h': uptimePct(checks24h),
          '7d': uptimePct(checks7d),
          '30d': uptimePct(checks),
        },
        latency: { avgMs, p95Ms },
        recentChecks: checks.slice(0, 50),
        totalChecks: checks.length,
      };

      return ApiResponse.ok(stats, '取得統計成功');
    } catch (e) {
      console.error('[api.monitors.stats]', e);
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, '取得統計失敗');
    }
  },
);
