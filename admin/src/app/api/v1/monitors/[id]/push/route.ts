/**
 * POST /api/v1/monitors/[id]/push —— PUSH 監控的心跳接收端點。
 *
 * 認證機制:header `x-monitor-push-token` 比對 Monitor.pushToken(constant-time)。
 * 不走 withPermission(外部系統呼叫,不會有 session);middleware 已排除 /api/v1。
 *
 * 為了避免讓 token 落到稽核紀錄,這支端點刻意不寫 audit log。
 */
import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { recordPushHeartbeat } from '@/lib/monitor-engine';
import { prisma } from '@/lib/prisma';

type RouteCtx = { params: Promise<Record<string, string>> };

function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(request: NextRequest, { params }: RouteCtx) {
  const { id } = await params;
  const provided = request.headers.get('x-monitor-push-token') ?? '';
  if (!provided) {
    return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '缺少 x-monitor-push-token');
  }
  try {
    const monitor = await prisma.monitor.findUnique({
      where: { id },
      select: { id: true, kind: true, enabled: true, pushToken: true },
    });
    if (!monitor) {
      return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '找不到監控');
    }
    if (monitor.kind !== 'PUSH') {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '此監控不是 PUSH 類型');
    }
    if (!monitor.pushToken || !safeCompare(monitor.pushToken, provided)) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, 'push token 不正確');
    }
    if (!monitor.enabled) {
      // 仍然接受心跳但提示已停用 —— 避免外部 caller 重試風暴
      return ApiResponse.ok({ accepted: false, reason: 'monitor disabled' }, 'monitor 已停用');
    }
    await recordPushHeartbeat(id);
    return ApiResponse.ok({ accepted: true, at: new Date().toISOString() }, 'heartbeat received');
  } catch (e) {
    console.error('[api.monitors.push]', e);
    return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, '處理心跳失敗');
  }
}
