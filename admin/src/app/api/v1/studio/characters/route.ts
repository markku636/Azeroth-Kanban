import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { listCharacters, createCharacter, type StudioActor } from '@/lib/studio-service';
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

// 角色庫（owner-scoped，可跨專案重用）。
export const GET = withPermission(
  PERMISSIONS.STUDIO_VIEW,
  async (request: NextRequest) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === '1';
    return ApiResponse.json(await listCharacters(memberId, { includeArchived }, { bypassOwnership: bypass }));
  },
);

export const POST = withPermission(
  PERMISSIONS.STUDIO_CREATE,
  async (request: NextRequest) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
    }
    return ApiResponse.json(
      await createCharacter(
        memberId,
        {
          name: str(body.name) ?? '',
          persona: str(body.persona),
          appearance: str(body.appearance),
          sealSpeaker: str(body.sealSpeaker),
          ttsEngine: str(body.ttsEngine),
          loraScale: typeof body.loraScale === 'number' ? body.loraScale : undefined,
          voiceInstruct: str(body.voiceInstruct),
        },
        buildActor(session, request),
      ),
    );
  },
);
