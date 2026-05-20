import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { PERMISSIONS } from '@/config/permissions';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { buildIncidentActor } from '@/lib/incident-actor';
import {
  deleteMaintenanceWindow,
  getMaintenanceWindow,
  updateMaintenanceWindow,
} from '@/lib/maintenance-window-service';
import { withPermission } from '@/lib/with-permission';

type RouteCtx = { params: Promise<Record<string, string>> };

/** GET /api/v1/maintenance-windows/[id] */
export const GET = withPermission(
  PERMISSIONS.MAINTENANCE_WINDOWS_VIEW,
  async (_request: NextRequest, { params }: RouteCtx) => {
    const session = await auth();
    if (!session?.user?.memberId) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    }
    const { id } = await params;
    return ApiResponse.json(await getMaintenanceWindow(id));
  },
);

/** PATCH /api/v1/maintenance-windows/[id] */
export const PATCH = withPermission(
  PERMISSIONS.MAINTENANCE_WINDOWS_EDIT,
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
    const actor = buildIncidentActor(session.user, request);
    return ApiResponse.json(await updateMaintenanceWindow(id, body as Record<string, unknown>, actor));
  },
);

/** DELETE /api/v1/maintenance-windows/[id] */
export const DELETE = withPermission(
  PERMISSIONS.MAINTENANCE_WINDOWS_DELETE,
  async (request: NextRequest, { params }: RouteCtx) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    }
    const { id } = await params;
    const actor = buildIncidentActor(session.user, request);
    return ApiResponse.json(await deleteMaintenanceWindow(id, actor));
  },
);
