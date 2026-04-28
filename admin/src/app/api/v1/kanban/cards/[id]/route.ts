import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import type { CardStatus } from '@prisma/client';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { getCard, updateCard, deleteCard, type KanbanActor } from '@/lib/kanban-service';
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

export const GET = withPermission(
  PERMISSIONS.KANBAN_VIEW,
  async (_request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const ownerId = session?.user?.memberId;
    if (!ownerId) {return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');}
    const { id } = await params;
    return ApiResponse.json(await getCard(ownerId, id));
  }
);

export const PATCH = withPermission(
  PERMISSIONS.KANBAN_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const ownerId = session?.user?.memberId;
    if (!ownerId) {return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');}
    const { id } = await params;

    let body: { title?: unknown; description?: unknown; status?: unknown };
    try {
      body = await request.json();
    } catch {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
    }

    const patch: { title?: string; description?: string | null; status?: CardStatus } = {};
    if (typeof body.title === 'string') {patch.title = body.title;}
    if (typeof body.description === 'string') {patch.description = body.description;}
    else if (body.description === null) {patch.description = null;}
    if (typeof body.status === 'string' && VALID_STATUSES.includes(body.status as CardStatus)) {
      patch.status = body.status as CardStatus;
    }

    return ApiResponse.json(await updateCard(ownerId, id, patch, buildActor(session, request)));
  }
);

export const DELETE = withPermission(
  PERMISSIONS.KANBAN_DELETE,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const ownerId = session?.user?.memberId;
    if (!ownerId) {return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');}
    const { id } = await params;
    return ApiResponse.json(await deleteCard(ownerId, id, buildActor(session, request)));
  }
);
