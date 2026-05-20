import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { PERMISSIONS } from '@/config/permissions';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { buildIncidentActor } from '@/lib/incident-actor';
import { deleteIncident, getIncident, updateIncident } from '@/lib/incident-service';
import { hasPermission } from '@/lib/permission-service';
import { withPermission } from '@/lib/with-permission';

type RouteCtx = { params: Promise<Record<string, string>> };

/** GET /api/v1/incidents/[id] */
export const GET = withPermission(
  PERMISSIONS.INCIDENTS_VIEW,
  async (_request: NextRequest, { params }: RouteCtx) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    }
    const { id } = await params;
    const roles = (session.user as { roles?: string[] }).roles ?? [];
    const canViewAll = await hasPermission(roles, PERMISSIONS.INCIDENTS_VIEW_ALL);
    return ApiResponse.json(await getIncident(memberId, id, canViewAll));
  },
);

/** PATCH /api/v1/incidents/[id] —— 更新狀態 / 嚴重度 / 內容 */
export const PATCH = withPermission(
  PERMISSIONS.INCIDENTS_EDIT,
  async (request: NextRequest, { params }: RouteCtx) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    }
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
    }
    if (!body || typeof body !== 'object') {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
    }
    const roles = (session.user as { roles?: string[] }).roles ?? [];
    const canEditAll = await hasPermission(roles, PERMISSIONS.INCIDENTS_VIEW_ALL);
    const actor = buildIncidentActor(session.user, request);
    return ApiResponse.json(
      await updateIncident(memberId, id, body as Record<string, unknown>, actor, canEditAll),
    );
  },
);

/** DELETE /api/v1/incidents/[id] */
export const DELETE = withPermission(
  PERMISSIONS.INCIDENTS_DELETE,
  async (request: NextRequest, { params }: RouteCtx) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    }
    const { id } = await params;
    const roles = (session.user as { roles?: string[] }).roles ?? [];
    const canEditAll = await hasPermission(roles, PERMISSIONS.INCIDENTS_VIEW_ALL);
    const actor = buildIncidentActor(session.user, request);
    return ApiResponse.json(await deleteIncident(memberId, id, actor, canEditAll));
  },
);
