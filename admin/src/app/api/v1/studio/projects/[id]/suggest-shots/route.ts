import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { createShot, getProject, getStoryboard, type StudioActor } from '@/lib/studio-service';
import { getIpFromRequest } from '@/lib/audit-log-service';
import { suggestShots } from '@/lib/studio/shot-assist';
import { providerConfigured, resolveProvider } from '@/lib/studio/llm';

function buildActor(session: Session, request: NextRequest): StudioActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

// 新增分鏡協助（Gemini Vertex / Claude，由 LLM_PROVIDER 決定）。
//   body: { sceneId?, hint?, count?, persist? }
//   - persist=false（預設）→ 只回建議 { shots }，給 modal 預填單鏡讓使用者審核再新增
//   - persist=true          → 直接 createShot 落該場，回完整分鏡看板（看板「AI 續寫 N 鏡」用）
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    let body: { sceneId?: unknown; hint?: unknown; count?: unknown; persist?: unknown };
    try {
      body = await request.json();
    } catch {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
    }

    const provider = resolveProvider();
    if (!providerConfigured(provider)) {
      return ApiResponse.fail(
        ApiReturnCode.INTERNAL_ERROR,
        provider === 'vertex'
          ? 'Gemini Vertex 尚未設定（需 GOOGLE_VERTEX_PROJECT 與 GOOGLE_VERTEX_CREDENTIALS）'
          : 'AI 尚未啟用：未設定 ANTHROPIC_API_KEY',
      );
    }

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    // 擁有權把關：非本人專案且無 EDIT_ALL → 擋（getProject 已含此邏輯）
    const proj = await getProject(memberId, id, { bypassOwnership: bypass });
    if (proj.code !== ApiReturnCode.SUCCESS) return ApiResponse.json(proj);

    const sceneId =
      typeof body.sceneId === 'string' && body.sceneId && body.sceneId !== '__unassigned__' ? body.sceneId : null;
    const hint = typeof body.hint === 'string' ? body.hint : undefined;
    const persist = body.persist === true;
    const rawCount = typeof body.count === 'number' ? Math.floor(body.count) : 1;
    // 單鏡補完固定 1；續寫上限 12（避免一次塞太多 / 配額爆量）
    const count = Math.min(persist ? 12 : 1, Math.max(1, rawCount));

    let shots;
    try {
      shots = await suggestShots(id, { sceneId, hint, count });
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 產生分鏡失敗' + (raw ? `：${raw}` : ''));
    }
    if (!shots.length) return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 沒有產生分鏡，請換個描述再試');

    if (!persist) return ApiResponse.ok({ shots }, 'AI 已建議分鏡');

    const actor = buildActor(session, request);
    for (const ps of shots) {
      await createShot(
        memberId,
        {
          projectId: id,
          sceneId,
          visual: ps.visual,
          tts: ps.tts,
          motion: ps.motion,
          emotion: ps.emotion,
          branch: ps.branch,
          caption: ps.caption,
          punchline: ps.punchline,
          sfx: ps.sfx === 'none' ? undefined : ps.sfx,
          punch: ps.punch,
          punchAtFrac: ps.punchAtFrac,
          punchZoom: ps.punchZoom,
        },
        actor,
        { bypassOwnership: bypass },
      );
    }
    return ApiResponse.json(await getStoryboard(memberId, id, { bypassOwnership: bypass }));
  },
);
