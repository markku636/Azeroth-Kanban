import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { createScene, getProject, getStoryboard, updateProject, type StudioActor } from '@/lib/studio-service';
import { getIpFromRequest } from '@/lib/audit-log-service';
import { planScript } from '@/lib/studio/interview';
import { buildStoryContext } from '@/lib/studio/story-context';

function buildActor(session: Session, request: NextRequest): StudioActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

// 腳本層 AI 生成：題材 → logline + 分場大綱（每場 synopsis/dialogue），落 DB。
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    let body: { premise?: unknown; sceneCount?: unknown };
    try {
      body = await request.json();
    } catch {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
    }

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const actor = buildActor(session, request);

    // 題材：優先用 body.premise，否則退回專案 description。
    const proj = await getProject(memberId, id, { bypassOwnership: bypass });
    if (proj.code !== ApiReturnCode.SUCCESS || !proj.data) return ApiResponse.json(proj);
    const premise = (typeof body.premise === 'string' ? body.premise.trim() : '') || (proj.data.description ?? '').trim();
    if (!premise) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請先填寫故事題材（專案描述）或在生成時提供題材');
    const sceneCount = typeof body.sceneCount === 'number' ? Math.min(12, Math.max(1, body.sceneCount)) : 4;

    let script;
    try {
      script = await planScript(premise, sceneCount, await buildStoryContext(id));
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      const friendly = /api[\s_-]?key|anthropic|authentication|unauthor|credential|vertex/i.test(raw)
        ? 'AI 生成腳本尚未啟用：未設定 AI 憑證，可改用「+ 新增場景」手動建立腳本'
        : 'AI 生成腳本失敗，請稍後再試' + (raw ? `：${raw}` : '');
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, friendly);
    }
    if (!script.scenes.length) return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 沒有產生場景，請換個題材再試');

    // 寫回 logline + 題材，並把階段推進到 script。
    await updateProject(memberId, id, { logline: script.logline, description: premise, status: 'script' }, actor, { bypassOwnership: bypass });
    for (const ps of script.scenes) {
      await createScene(memberId, id, { title: ps.title || '未命名場景', synopsis: ps.synopsis, dialogue: ps.dialogue }, actor, { bypassOwnership: bypass });
    }
    const sb = await getStoryboard(memberId, id, { bypassOwnership: bypass });
    return ApiResponse.ok({ storyboard: sb.data, sceneCount: script.scenes.length, logline: script.logline }, '腳本已生成');
  },
);
