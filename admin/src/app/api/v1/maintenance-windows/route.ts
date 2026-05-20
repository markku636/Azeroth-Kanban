import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { PERMISSIONS } from '@/config/permissions';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { buildIncidentActor } from '@/lib/incident-actor';
import { createMaintenanceWindow, listMaintenanceWindows } from '@/lib/maintenance-window-service';
import { withPermission } from '@/lib/with-permission';

/** GET /api/v1/maintenance-windows —— 維護視窗列表 */
export const GET = withPermission(PERMISSIONS.MAINTENANCE_WINDOWS_VIEW, async () => {
  const session = await auth();
  if (!session?.user?.memberId) {
    return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  }
  return ApiResponse.json(await listMaintenanceWindows());
});

/** POST /api/v1/maintenance-windows —— 建立維護視窗 */
export const POST = withPermission(PERMISSIONS.MAINTENANCE_WINDOWS_CREATE, async (request: NextRequest) => {
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
  return ApiResponse.json(await createMaintenanceWindow(memberId, body as Record<string, unknown>, actor));
});
