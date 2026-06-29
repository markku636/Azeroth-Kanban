import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject, updateStoryBible, getStoryBible, type StudioActor } from '@/lib/studio-service';
import { getIpFromRequest } from '@/lib/audit-log-service';
import { planStoryBible } from '@/lib/studio/interview';
import { buildStoryContext } from '@/lib/studio/story-context';

function buildActor(session: Session, request: NextRequest): StudioActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

// 題材 → AI 生成完整故事聖經並落庫（premise/worldSetting/styleGuide/tone/genre/targetAudience）。
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    let body: { seed?: unknown };
    try { body = await request.json(); } catch { body = {}; }

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const proj = await getProject(memberId, id, { bypassOwnership: bypass });
    if (proj.code !== ApiReturnCode.SUCCESS || !proj.data) return ApiResponse.json(proj);

    const seed = (typeof body.seed === 'string' ? body.seed.trim() : '') || (proj.data.description ?? '').trim();
    if (!seed) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請先填「題材／設定」或在生成時提供題材一句話');

    let bible;
    try {
      bible = await planStoryBible(seed, await buildStoryContext(id));
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      const friendly = /api[\s_-]?key|anthropic|authentication|unauthor|credential|vertex/i.test(raw)
        ? 'AI 未啟用：請設定 AI 憑證（Claude：ANTHROPIC_API_KEY／Gemini：GOOGLE_VERTEX_*）'
        : 'AI 生成設定失敗，請稍後再試' + (raw ? `：${raw}` : '');
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, friendly);
    }

    // 只覆寫 AI 有產出的欄位（不清空使用者已填的）；description 維持 seed。
    const patch: Record<string, string> = { description: seed };
    for (const k of ['premise', 'worldSetting', 'styleGuide', 'tone', 'genre', 'targetAudience'] as const) {
      if (bible[k]?.trim()) patch[k] = bible[k].trim();
    }
    const upd = await updateStoryBible(memberId, id, patch, buildActor(session, request), { bypassOwnership: bypass });
    if (upd.code !== ApiReturnCode.SUCCESS) return ApiResponse.json(upd);
    const full = await getStoryBible(memberId, id, { bypassOwnership: bypass });
    return ApiResponse.ok({ bible: full.data }, '已用 AI 生成故事設定');
  },
);
