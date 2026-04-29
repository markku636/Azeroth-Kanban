import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import type { CardStatus } from '@prisma/client';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { moveCard, type KanbanActor } from '@/lib/kanban-service';
import { getIpFromRequest } from '@/lib/audit-log-service';

const VALID_STATUSES: CardStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

function buildActor(session: Session, request: NextRequest): KanbanActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

export const POST = withPermission(
  PERMISSIONS.KANBAN_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const ownerId = session?.user?.memberId;
    if (!ownerId) {return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');}
    const { id } = await params;

    let body: { status?: unknown; beforeId?: unknown; afterId?: unknown };
    try {
      body = await request.json();
    } catch {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
    }
    if (typeof body.status !== 'string' || !VALID_STATUSES.includes(body.status as CardStatus)) {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '狀態無效');
    }

    return ApiResponse.json(
      await moveCard(
        ownerId,
        id,
        {
          status: body.status as CardStatus,
          beforeId: typeof body.beforeId === 'string' ? body.beforeId : null,
          afterId: typeof body.afterId === 'string' ? body.afterId : null,
        },
        buildActor(session, request)
      )
    );
  }
);
