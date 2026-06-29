import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getIpFromRequest } from '@/lib/audit-log-service';
import { deleteMedia } from '@/lib/media-service';
import type { StudioActor } from '@/lib/studio-service';

export const runtime = 'nodejs';

function buildActor(session: Session, request: NextRequest): StudioActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

// 刪除媒體（owner 把關；具 media.delete_all 則跨 owner）。
export const DELETE = withPermission(
  PERMISSIONS.MEDIA_DELETE,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;
    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.MEDIA_DELETE_ALL);
    return ApiResponse.json(await deleteMedia(id, memberId, buildActor(session, request), { bypassOwnership: bypass }));
  },
);
