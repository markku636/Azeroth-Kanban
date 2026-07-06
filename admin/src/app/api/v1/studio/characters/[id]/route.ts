import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getCharacter, updateCharacter, deleteCharacter, type StudioActor } from '@/lib/studio-service';
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

export const GET = withPermission(
  PERMISSIONS.STUDIO_VIEW,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;
    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
    return ApiResponse.json(await getCharacter(memberId, id, { bypassOwnership: bypass }));
  },
);

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
    return ApiResponse.json(
      await updateCharacter(
        memberId,
        id,
        {
          name: str(body.name),
          persona: str(body.persona),
          appearance: str(body.appearance),
          sealSpeaker: str(body.sealSpeaker),
          ttsEngine: str(body.ttsEngine),
          loraScale: typeof body.loraScale === 'number' ? body.loraScale : undefined,
          voiceInstruct: str(body.voiceInstruct),
          kind: body.kind === null ? null : str(body.kind), // null＝清空（回人類預設）
          isArchived: typeof body.isArchived === 'boolean' ? body.isArchived : undefined,
        },
        buildActor(session, request),
        { bypassOwnership: bypass },
      ),
    );
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
    const hard = new URL(request.url).searchParams.get('hard') === '1';
    return ApiResponse.json(await deleteCharacter(memberId, id, { hard }, buildActor(session, request), { bypassOwnership: bypass }));
  },
);
