import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject } from '@/lib/studio-service';
import { polishShotField, SHOT_POLISH_FIELDS, type ShotPolishField } from '@/lib/studio/shot-assist';
import { providerConfigured, resolveProvider } from '@/lib/studio/llm';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

// 單鏡欄位「魔法棒」潤飾（provider 由 LLM_PROVIDER 決定）。集合層路由（不帶 shotId），
// 因為潤飾需在「新增中（分鏡尚未存）」也能用，且只讀不寫 DB；以 projectId 做擁有權把關。
//   body: { projectId, field: visual|tts|caption|punchline, text, visual?, tts?, caption?, punchline? }
//   回 { text }（潤飾結果，不落庫；由前端預填欄位讓使用者審核後再儲存）
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

  const projectId = str(body.projectId);
  if (!projectId) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少 projectId');
  const field = str(body.field) as ShotPolishField;
  if (!SHOT_POLISH_FIELDS.includes(field)) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '不支援的欄位');
  const text = str(body.text);
  if (text.length > 4000) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '內容過長（上限 4000 字）');

  const provider = resolveProvider();
  if (!providerConfigured(provider)) {
    return ApiResponse.fail(
      ApiReturnCode.INTERNAL_ERROR,
      provider === 'vertex'
        ? 'Gemini Vertex 尚未設定（需 GOOGLE_VERTEX_PROJECT 與 GOOGLE_VERTEX_CREDENTIALS）'
        : 'AI 尚未啟用：未設定 ANTHROPIC_API_KEY',
    );
  }

  // 擁有權把關：非本人專案且無 EDIT_ALL → 擋（getProject 已含此邏輯）。
  const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
  const proj = await getProject(memberId, projectId, { bypassOwnership: bypass });
  if (proj.code !== ApiReturnCode.SUCCESS) return ApiResponse.json(proj);

  try {
    const out = await polishShotField(projectId, {
      field, text,
      visual: str(body.visual), tts: str(body.tts), caption: str(body.caption), punchline: str(body.punchline),
    });
    if (!out.trim()) return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 沒有產生內容，請再試一次');
    return ApiResponse.ok({ text: out }, 'AI 已潤飾');
  } catch (e) {
    const raw = e instanceof Error ? e.message : '';
    return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 潤飾失敗' + (raw ? `：${raw}` : ''));
  }
});
