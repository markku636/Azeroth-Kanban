import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { PERMISSIONS } from '@/config/permissions';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { buildIncidentActor } from '@/lib/incident-actor';
import { hasPermission } from '@/lib/permission-service';
import { startTriage } from '@/lib/selkie-service';
import { withPermission } from '@/lib/with-permission';

type RouteCtx = { params: Promise<Record<string, string>> };

/** POST /api/v1/incidents/[id]/triage —— 觸發 Selkie 調查 */
export const POST = withPermission(
  PERMISSIONS.INCIDENTS_TRIAGE,
  async (request: NextRequest, { params }: RouteCtx) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    }
    const { id } = await params;
    const roles = (session.user as { roles?: string[] }).roles ?? [];
    const canViewAll = await hasPermission(roles, PERMISSIONS.INCIDENTS_VIEW_ALL);
    const actor = buildIncidentActor(session.user, request);
    return ApiResponse.json(await startTriage(memberId, id, actor, canViewAll));
  },
);
