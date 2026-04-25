import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { listOwnerBoard, createCard, type KanbanActor } from '@/lib/kanban-service';
import { getIpFromRequest } from '@/lib/audit-log-service';

function buildActor(session: Session, request: NextRequest): KanbanActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

export const GET = withPermission(PERMISSIONS.KANBAN_VIEW, async () => {
  const session = await auth();
  const ownerId = session?.user?.memberId;
  if (!ownerId) {
    return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  }
  return ApiResponse.json(await listOwnerBoard(ownerId));
});

export const POST = withPermission(PERMISSIONS.KANBAN_CREATE, async (request: NextRequest) => {
  const session = await auth();
  const ownerId = session?.user?.memberId;
  if (!ownerId) {
    return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  }
  let body: { title?: unknown; description?: unknown };
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  return ApiResponse.json(
    await createCard(
      ownerId,
      {
        title: typeof body.title === 'string' ? body.title : '',
        description: typeof body.description === 'string' ? body.description : undefined,
      },
      buildActor(session, request)
    )
  );
});
