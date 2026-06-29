import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { createShot, getStoryboard, type StudioActor } from '@/lib/studio-service';
import { getIpFromRequest } from '@/lib/audit-log-service';
import { planSceneShots } from '@/lib/studio/interview';
import { buildStoryContext } from '@/lib/studio/story-context';

function buildActor(session: Session, request: NextRequest): StudioActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

// 把單一故事場景的 synopsis/dialogue 展開成分鏡（落該 sceneId）。
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    let body: { count?: unknown };
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const count = typeof body.count === 'number' ? Math.min(12, Math.max(1, body.count)) : 3;

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const actor = buildActor(session, request);

    const scene = await prisma.scene.findFirst({
      where: bypass ? { id } : { id, ownerId: memberId },
      select: { id: true, projectId: true, title: true, synopsis: true, dialogue: true },
    });
    if (!scene) return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '找不到此場景');
    if (!scene.synopsis?.trim() && !scene.dialogue?.trim()) {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請先填寫這一場的「劇情概要」再展開為分鏡');
    }

    const project = await prisma.studioProject.findUnique({
      where: { id: scene.projectId },
      select: { logline: true, description: true },
    });

    let shots;
    try {
      shots = await planSceneShots(scene, count, { logline: project?.logline, premise: project?.description }, await buildStoryContext(scene.projectId));
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      const friendly = /api[\s_-]?key|anthropic|authentication|unauthor|credential|vertex/i.test(raw)
        ? 'AI 展開分鏡尚未啟用：未設定 AI 憑證，可改用該場下方「+ 新增分鏡」手動建立'
        : 'AI 展開分鏡失敗，請稍後再試' + (raw ? `：${raw}` : '');
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, friendly);
    }
    if (!shots.length) return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 沒有產生分鏡，請調整劇情概要再試');

    for (const ps of shots) {
      await createShot(
        memberId,
        {
          projectId: scene.projectId, sceneId: scene.id, visual: ps.visual, tts: ps.tts, motion: ps.motion, emotion: ps.emotion, branch: ps.branch,
          caption: ps.caption, punchline: ps.punchline, sfx: ps.sfx === 'none' ? undefined : ps.sfx, punch: ps.punch,
          punchAtFrac: ps.punchAtFrac, punchZoom: ps.punchZoom,
        },
        actor,
        { bypassOwnership: bypass },
      );
    }
    const sb = await getStoryboard(memberId, scene.projectId, { bypassOwnership: bypass });
    return ApiResponse.ok({ storyboard: sb.data, shotCount: shots.length }, '已展開為分鏡');
  },
);
