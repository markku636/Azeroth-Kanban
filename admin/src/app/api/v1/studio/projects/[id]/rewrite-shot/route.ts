import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject } from '@/lib/studio-service';
import { coercePlannedShots, rewriteShot } from '@/lib/studio/interview';
import { buildStoryContext } from '@/lib/studio/story-context';
import { providerConfigured, resolveProvider } from '@/lib/studio/llm';

export const runtime = 'nodejs';

// 逐鏡重寫（審核時「換一個」）：給定某鏡與前後鏡旁白，回一個「不同但更好」的替代版本（不落庫）。
//   body: { current: {...分鏡欄位}, prevTts?, nextTts?, instruction? } → { shot }
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    let body: { current?: unknown; prevTts?: unknown; nextTts?: unknown; instruction?: unknown };
    try { body = await request.json(); } catch { return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤'); }

    const provider = resolveProvider();
    if (!providerConfigured(provider)) {
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR,
        provider === 'vertex' ? 'Gemini Vertex 尚未設定' : 'AI 尚未啟用：未設定 ANTHROPIC_API_KEY');
    }

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const proj = await getProject(memberId, id, { bypassOwnership: bypass });
    if (proj.code !== ApiReturnCode.SUCCESS) return ApiResponse.json(proj);

    const current = coercePlannedShots([body.current])[0];
    if (!current) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少要重寫的分鏡內容');
    const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 300) : undefined);

    let shot;
    try {
      const story = await buildStoryContext(id);
      shot = await rewriteShot({ current, prevTts: str(body.prevTts), nextTts: str(body.nextTts), instruction: str(body.instruction) }, story);
    } catch (e) {
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 重寫失敗' + (e instanceof Error ? `：${e.message}` : ''));
    }
    if (!shot) return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 沒有產生有效的分鏡，請再試一次');
    return ApiResponse.ok({ shot }, '已換一個版本（請檢視後採用）');
  },
);
