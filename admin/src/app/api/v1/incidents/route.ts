import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { PERMISSIONS } from '@/config/permissions';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { buildIncidentActor } from '@/lib/incident-actor';
import { createIncident, listIncidents } from '@/lib/incident-service';
import { hasPermission } from '@/lib/permission-service';
import { withPermission } from '@/lib/with-permission';

/** GET /api/v1/incidents —— 事故列表 */
export const GET = withPermission(PERMISSIONS.INCIDENTS_VIEW, async () => {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) {
    return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  }
  const roles = (session.user as { roles?: string[] }).roles ?? [];
  const canViewAll = await hasPermission(roles, PERMISSIONS.INCIDENTS_VIEW_ALL);
  return ApiResponse.json(await listIncidents(memberId, canViewAll));
});

/** POST /api/v1/incidents —— 建立事故 */
export const POST = withPermission(PERMISSIONS.INCIDENTS_CREATE, async (request: NextRequest) => {
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
  return ApiResponse.json(
    await createIncident(memberId, body as Record<string, unknown>, actor),
  );
});
