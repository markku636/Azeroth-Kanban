import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { createShot, getProject, getStoryboard, type StudioActor } from '@/lib/studio-service';
import { getIpFromRequest } from '@/lib/audit-log-service';
import { adaptStoryboardFromSource, coercePlannedShots, type PlannedShot } from '@/lib/studio/interview';
import { fetchYoutubeSource, cleanSourceTranscript } from '@/lib/studio/youtube-import';
import { buildStoryContext } from '@/lib/studio/story-context';
import { providerConfigured, resolveProvider } from '@/lib/studio/llm';

export const runtime = 'nodejs'; // fetchYoutubeSource 用 node fetch

function buildActor(session: Session, request: NextRequest): StudioActor {
  return { id: session.user.memberId, email: session.user.email ?? null, name: session.user.name ?? null, ipAddress: getIpFromRequest(request) };
}

// 從 YouTube 影片「改編」成本專案的分鏡（相同節奏、內容原創）。三種用法：
//   ① 預覽：body { url?|source?, count?, persist:false（預設）} → 只回 { shots } 供 modal 審核（不落庫）
//   ② 直接落庫已審核的分鏡：body { shots:[...], sceneId? } → 略過 LLM，直接 createShot 這批（不需 AI 憑證）
//   ③ 一步到位：body { url?|source?, count?, persist:true } → 改編後直接落庫（向後相容）
//   - url：YouTube 連結（best-effort 抓字幕；抓不到會回可行動錯誤請改貼 source）
//   - source：直接貼上的字幕逐字稿／腳本（最可靠，優先使用）
const MAX_SHOTS = 40; // 一次上限（~2.5 分鐘；>12 鏡走分批改編）

export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    let body: { url?: unknown; source?: unknown; sceneId?: unknown; count?: unknown; persist?: unknown; shots?: unknown; styleHint?: unknown };
    try { body = await request.json(); } catch { return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤'); }

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const proj = await getProject(memberId, id, { bypassOwnership: bypass });
    if (proj.code !== ApiReturnCode.SUCCESS) return ApiResponse.json(proj);

    const sceneId = typeof body.sceneId === 'string' && body.sceneId && body.sceneId !== '__unassigned__' ? body.sceneId : null;
    const actor = buildActor(session, request);

    // ── ② 直接落庫已審核的分鏡陣列（不經 LLM、不需憑證）──
    if (Array.isArray(body.shots) && body.shots.length) {
      const reviewed = coercePlannedShots(body.shots).slice(0, MAX_SHOTS);
      if (!reviewed.length) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '沒有可建立的分鏡（每鏡至少要有畫面或旁白）');
      await persistShots(memberId, id, sceneId, reviewed, actor, bypass);
      return ApiResponse.json(await getStoryboard(memberId, id, { bypassOwnership: bypass }));
    }

    // ── ①③ 需要 AI 改編 ──
    const provider = resolveProvider();
    if (!providerConfigured(provider)) {
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR,
        provider === 'vertex' ? 'Gemini Vertex 尚未設定（需 GOOGLE_VERTEX_PROJECT 與 GOOGLE_VERTEX_CREDENTIALS）' : 'AI 尚未啟用：未設定 ANTHROPIC_API_KEY');
    }

    // 來源：優先用貼上的 source（最可靠）；否則用 url best-effort 抓字幕
    let source = typeof body.source === 'string' ? body.source.trim() : '';
    if (!source) {
      const url = typeof body.url === 'string' ? body.url.trim() : '';
      if (!url) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請提供 YouTube 網址或貼上字幕逐字稿');
      try {
        const yt = await fetchYoutubeSource(url);
        source = yt.transcript;
      } catch (e) {
        return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, e instanceof Error ? e.message : '抓取 YouTube 字幕失敗，請改用貼上逐字稿');
      }
    }
    source = cleanSourceTranscript(source); // 剝除時間碼／SRT/VTT 結構／[音樂]／重複行 → 讓 AI 看到乾淨敘事
    if (source.length < 20) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '來源內容太短，無法改編（請貼上較完整的字幕/腳本）');

    const persist = body.persist === true;
    const rawCount = typeof body.count === 'number' ? Math.floor(body.count) : 8;
    const count = Math.min(MAX_SHOTS, Math.max(1, rawCount));
    const styleHint = typeof body.styleHint === 'string' ? body.styleHint.trim().slice(0, 200) : undefined; // 可選：本次改編的風格傾向

    let shots;
    try {
      const story = await buildStoryContext(id);
      shots = await adaptStoryboardFromSource(source, count, story, styleHint);
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 改編分鏡失敗' + (raw ? `：${raw}` : ''));
    }
    if (!shots.length) return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 沒有產生分鏡，請換段來源或稍後再試');

    if (!persist) return ApiResponse.ok({ shots }, 'AI 已依來源改編出分鏡（請檢視後採用）');

    await persistShots(memberId, id, sceneId, shots, actor, bypass);
    return ApiResponse.json(await getStoryboard(memberId, id, { bypassOwnership: bypass }));
  },
);

/** 把 PlannedShot[] 依序 createShot 落庫（sfx==='none' 視為不放音效）。 */
async function persistShots(
  memberId: string, projectId: string, sceneId: string | null,
  shots: PlannedShot[], actor: StudioActor, bypass: boolean,
): Promise<void> {
  for (const ps of shots) {
    await createShot(memberId, {
      projectId, sceneId,
      visual: ps.visual, tts: ps.tts, motion: ps.motion, emotion: ps.emotion, branch: ps.branch,
      caption: ps.caption, punchline: ps.punchline, sfx: ps.sfx === 'none' ? undefined : ps.sfx,
      punch: ps.punch, punchAtFrac: ps.punchAtFrac, punchZoom: ps.punchZoom,
    }, actor, { bypassOwnership: bypass });
  }
}
