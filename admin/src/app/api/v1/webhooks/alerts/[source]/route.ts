/**
 * POST /api/v1/webhooks/alerts/[source] —— 告警接收 webhook(公開端點)
 *
 * 外部監控/告警系統(simulator、PagerDuty、Alertmanager...)把告警 POST 到這裡。
 * 以共用密鑰(x-selkie-webhook-secret 標頭)驗證,不走 NextAuth。
 * 收到後:正規化告警 → 建立事故 → 自動觸發 Selkie triage。
 *
 * 安全:middleware 的 matcher 已排除整個 /api/v1,故此路由不受登入守衛攔截;
 * 改以共用密鑰把關。密鑰由 SELKIE_WEBHOOK_SECRET 環境變數設定。
 */
import { NextRequest } from 'next/server';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { getIpFromRequest } from '@/lib/audit-log-service';
import { ingestAlert } from '@/lib/alert-webhook-service';

type RouteCtx = { params: Promise<{ source: string }> };

export async function POST(request: NextRequest, { params }: RouteCtx) {
  const expected = process.env.SELKIE_WEBHOOK_SECRET ?? 'selkie-dev-secret';
  const provided = request.headers.get('x-selkie-webhook-secret');
  if (!provided || provided !== expected) {
    return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, 'webhook 密鑰無效或缺失');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤(需 JSON body)');
  }

  const { source } = await params;
  const ipAddress = getIpFromRequest(request);
  return ApiResponse.json(await ingestAlert(source, body, ipAddress));
}
