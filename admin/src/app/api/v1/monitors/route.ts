import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { PERMISSIONS } from '@/config/permissions';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { buildIncidentActor } from '@/lib/incident-actor';
import { createMonitor, listMonitors } from '@/lib/monitor-service';
import { withPermission } from '@/lib/with-permission';

/** GET /api/v1/monitors —— 監控列表 */
export const GET = withPermission(PERMISSIONS.MONITORS_VIEW, async () => {
  const session = await auth();
  if (!session?.user?.memberId) {
    return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  }
  return ApiResponse.json(await listMonitors());
});

/** POST /api/v1/monitors —— 建立監控 */
export const POST = withPermission(PERMISSIONS.MONITORS_CREATE, async (request: NextRequest) => {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) {
    return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  if (!body || typeof body !== 'object') {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  const actor = buildIncidentActor(session.user, request);
  return ApiResponse.json(await createMonitor(memberId, body as Record<string, unknown>, actor));
});
