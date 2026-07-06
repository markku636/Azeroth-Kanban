import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import {
  assignCharacterToShot, createScene, createShot, getProject, getStoryboard, listCharacters, type StudioActor,
} from '@/lib/studio-service';
import { getIpFromRequest } from '@/lib/audit-log-service';

function buildActor(session: Session, request: NextRequest): StudioActor {
  return { id: session.user.memberId, email: session.user.email ?? null, name: session.user.name ?? null, ipAddress: getIpFromRequest(request) };
}

export const GET = withPermission(
  PERMISSIONS.STUDIO_VIEW,
  async (_request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;
    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
    return ApiResponse.json(await getStoryboard(memberId, id, { bypassOwnership: bypass }));
  },
);

// ─────────────────────────── 分鏡匯入（POST）───────────────────────────

/** 一次匯入的分鏡總數上限（超過回 400） */
const MAX_IMPORT_SHOTS = 60;

/** 匯入用單鏡欄位：同 createShot 既有欄位集 + 可選 characterSlug（以 slug 從角色庫解析後指派） */
interface ImportShot {
  visual?: unknown; tts?: unknown; motion?: unknown; subtitle?: unknown;
  role?: unknown; speaker?: unknown; emotion?: unknown; branch?: unknown;
  caption?: unknown; punchline?: unknown; sfx?: unknown;
  punch?: unknown; punchAtFrac?: unknown; punchZoom?: unknown;
  characterSlug?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const asShot = (v: unknown): ImportShot => (v && typeof v === 'object' ? (v as ImportShot) : {});

/** 把匯入單鏡轉成 createShot 的輸入（不合法型別一律視為未提供 → 沿用 createShot 預設）。 */
function toShotInput(projectId: string, sceneId: string | null, s: ImportShot) {
  const sfx = str(s.sfx);
  return {
    projectId, sceneId,
    visual: str(s.visual), tts: str(s.tts), motion: str(s.motion), subtitle: str(s.subtitle),
    role: str(s.role), speaker: str(s.speaker), emotion: str(s.emotion), branch: str(s.branch),
    caption: str(s.caption), punchline: str(s.punchline), sfx: sfx === 'none' ? undefined : sfx,
    punch: typeof s.punch === 'boolean' ? s.punch : undefined,
    punchAtFrac: num(s.punchAtFrac), punchZoom: num(s.punchZoom),
  };
}

// 匯入外部備好的分鏡 JSON 直接落庫（同 from-youtube 的 persist 流程，但不經 LLM）。
//   body: { scenes?: [{ title, shots: [...] }], shots?: [...] }
//   - scenes：每組先 createScene（title 必填）再把 shots 落進該場景
//   - shots：頂層陣列落「未分場」
//   - 每鏡支援 createShot 既有欄位 + 可選 characterSlug（解析不到不擋匯入，僅略過指派）
//   - 一次上限 60 鏡，超過回 400
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    let body: { scenes?: unknown; shots?: unknown };
    try { body = await request.json(); } catch { return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤'); }
    if ((body.scenes !== undefined && !Array.isArray(body.scenes)) || (body.shots !== undefined && !Array.isArray(body.shots))) {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, 'scenes 與 shots 需為陣列');
    }

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const proj = await getProject(memberId, id, { bypassOwnership: bypass });
    if (proj.code !== ApiReturnCode.SUCCESS) return ApiResponse.json(proj);

    // 攤平成 (場景標題 | null, shots) 群組並驗證：場景需標題、總數上限 60 鏡
    const rawScenes: unknown[] = Array.isArray(body.scenes) ? body.scenes : [];
    const rawShots: unknown[] = Array.isArray(body.shots) ? body.shots : [];
    const groups: { title: string | null; shots: ImportShot[] }[] = [];
    for (const raw of rawScenes) {
      const sc = (raw && typeof raw === 'object' ? raw : {}) as { title?: unknown; shots?: unknown };
      const title = str(sc.title);
      if (!title) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '每個場景都需要標題 title');
      groups.push({ title, shots: Array.isArray(sc.shots) ? sc.shots.map(asShot) : [] });
    }
    if (rawShots.length) groups.push({ title: null, shots: rawShots.map(asShot) });
    const total = groups.reduce((n, g) => n + g.shots.length, 0);
    if (!total) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請至少提供一鏡（scenes[].shots 或 shots）');
    if (total > MAX_IMPORT_SHOTS) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, `一次最多匯入 ${MAX_IMPORT_SHOTS} 鏡（目前 ${total} 鏡）`);

    // characterSlug → characterId（從該 owner 角色庫解析；解析不到不擋匯入，僅略過指派）
    const slugs = new Set(groups.flatMap((g) => g.shots.map((s) => str(s.characterSlug))).filter((v): v is string => !!v));
    const charBySlug = new Map<string, string>();
    if (slugs.size) {
      const lib = await listCharacters(memberId, undefined, { bypassOwnership: bypass });
      if (lib.code === ApiReturnCode.SUCCESS && lib.data) {
        for (const c of lib.data) if (slugs.has(c.slug) && !charBySlug.has(c.slug)) charBySlug.set(c.slug, c.id);
      }
    }

    const actor = buildActor(session, request);
    for (const g of groups) {
      let sceneId: string | null = null;
      if (g.title) {
        const sc = await createScene(memberId, id, { title: g.title }, actor, { bypassOwnership: bypass });
        if (sc.code !== ApiReturnCode.SUCCESS || !sc.data) return ApiResponse.json(sc);
        sceneId = sc.data.id;
      }
      for (const ps of g.shots) {
        const created = await createShot(memberId, toShotInput(id, sceneId, ps), actor, { bypassOwnership: bypass });
        if (created.code !== ApiReturnCode.SUCCESS || !created.data) return ApiResponse.json(created);
        const slug = str(ps.characterSlug);
        const characterId = slug ? charBySlug.get(slug) : undefined;
        if (characterId) await assignCharacterToShot(memberId, created.data.id, characterId, actor, { bypassOwnership: bypass });
      }
    }
    return ApiResponse.json(await getStoryboard(memberId, id, { bypassOwnership: bypass }));
  },
);
