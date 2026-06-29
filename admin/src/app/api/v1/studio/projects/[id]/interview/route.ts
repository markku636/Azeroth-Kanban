import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { createScene, createShot, getStoryboard, type StudioActor } from '@/lib/studio-service';
import { getIpFromRequest } from '@/lib/audit-log-service';
import { planStoryboard } from '@/lib/studio/interview';
import { buildStoryContext } from '@/lib/studio/story-context';

function buildActor(session: Session, request: NextRequest): StudioActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

// Stage-1 訪談：故事點子 → claude 生分鏡 → 落 DB（與手動加分鏡並存）
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    let body: { idea?: unknown; count?: unknown };
    try {
      body = await request.json();
    } catch {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
    }
    const idea = typeof body.idea === 'string' ? body.idea.trim() : '';
    if (!idea) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請輸入故事點子');
    const count = typeof body.count === 'number' ? Math.min(20, Math.max(1, body.count)) : 6;

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const actor = buildActor(session, request);

    let plan;
    try {
      plan = await planStoryboard(idea, count, await buildStoryContext(id));
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      const friendly = /api[\s_-]?key|anthropic|authentication|unauthor/i.test(raw)
        ? 'AI 生成分鏡尚未啟用：未設定 ANTHROPIC_API_KEY，可改用「+ 新增分鏡」手動建立分鏡'
        : 'AI 生成分鏡失敗，請稍後再試' + (raw ? `：${raw}` : '');
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, friendly);
    }
    if (!plan.length) return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 沒有產生分鏡，請換個描述再試');

    const scene = await createScene(memberId, id, { title: 'AI 生成分鏡' }, actor, { bypassOwnership: bypass });
    if (scene.code !== ApiReturnCode.SUCCESS || !scene.data) return ApiResponse.json(scene);
    for (const ps of plan) {
      await createShot(
        memberId,
        {
          projectId: id, sceneId: scene.data.id, visual: ps.visual, tts: ps.tts, motion: ps.motion, emotion: ps.emotion, branch: ps.branch,
          caption: ps.caption, punchline: ps.punchline, sfx: ps.sfx === 'none' ? undefined : ps.sfx, punch: ps.punch,
          punchAtFrac: ps.punchAtFrac, punchZoom: ps.punchZoom,
        },
        actor,
        { bypassOwnership: bypass },
      );
    }
    return ApiResponse.json(await getStoryboard(memberId, id, { bypassOwnership: bypass }));
  },
);
