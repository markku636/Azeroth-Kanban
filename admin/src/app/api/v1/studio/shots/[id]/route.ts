import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import type { ShotStatus } from '@prisma/client';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { updateShot, deleteShot, assignCharacterToShot, type StudioActor } from '@/lib/studio-service';
import { getIpFromRequest } from '@/lib/audit-log-service';

function buildActor(session: Session, request: NextRequest): StudioActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export const PATCH = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
    }
    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const actor = buildActor(session, request);
    const opts = { bypassOwnership: bypass };

    const STD = ['role', 'speaker', 'subtitle', 'tts', 'visual', 'motion', 'emotion', 'branch', 'caption', 'punchline', 'sfx', 'punch', 'punchAtFrac', 'punchZoom', 'status'];
    let result = null;
    if (STD.some((k) => k in body)) {
      result = await updateShot(
        memberId,
        id,
        {
          role: str(body.role),
          speaker: str(body.speaker),
          subtitle: str(body.subtitle),
          tts: str(body.tts),
          visual: str(body.visual),
          motion: str(body.motion),
          emotion: str(body.emotion),
          branch: str(body.branch),
          caption: str(body.caption),
          punchline: str(body.punchline),
          sfx: str(body.sfx),
          punch: typeof body.punch === 'boolean' ? body.punch : undefined,
          punchAtFrac: typeof body.punchAtFrac === 'number' ? body.punchAtFrac : undefined,
          punchZoom: typeof body.punchZoom === 'number' ? body.punchZoom : undefined,
          status: str(body.status) as ShotStatus | undefined,
        },
        actor,
        opts,
      );
    }
    // characterId（指派/取消角色）走 assignCharacterToShot，連動 speaker/FaceID。
    if ('characterId' in body) {
      const cid = body.characterId === null ? null : str(body.characterId) ?? null;
      result = await assignCharacterToShot(memberId, id, cid, actor, opts);
    }
    if (!result) result = await updateShot(memberId, id, {}, actor, opts);
    return ApiResponse.json(result);
  },
);

export const DELETE = withPermission(
  PERMISSIONS.STUDIO_DELETE,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;
    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_DELETE_ALL);
    return ApiResponse.json(await deleteShot(memberId, id, buildActor(session, request), { bypassOwnership: bypass }));
  },
);
