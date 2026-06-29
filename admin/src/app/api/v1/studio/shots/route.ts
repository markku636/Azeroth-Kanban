import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { createShot, type StudioActor } from '@/lib/studio-service';
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

// 手動新增一個分鏡（你的「手動增加分鏡數」需求）
export const POST = withPermission(PERMISSIONS.STUDIO_EDIT, async (request: NextRequest) => {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  if (typeof body.projectId !== 'string') {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少 projectId');
  }
  const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
  return ApiResponse.json(
    await createShot(
      memberId,
      {
        projectId: body.projectId,
        sceneId: typeof body.sceneId === 'string' ? body.sceneId : null,
        visual: str(body.visual),
        tts: str(body.tts),
        motion: str(body.motion),
        subtitle: str(body.subtitle),
        role: str(body.role),
        speaker: str(body.speaker),
        emotion: str(body.emotion),
        branch: str(body.branch),
        caption: str(body.caption),
        punchline: str(body.punchline),
        sfx: str(body.sfx),
        punch: typeof body.punch === 'boolean' ? body.punch : undefined,
        punchAtFrac: typeof body.punchAtFrac === 'number' ? body.punchAtFrac : undefined,
        punchZoom: typeof body.punchZoom === 'number' ? body.punchZoom : undefined,
      },
      buildActor(session, request),
      { bypassOwnership: bypass },
    ),
  );
});
