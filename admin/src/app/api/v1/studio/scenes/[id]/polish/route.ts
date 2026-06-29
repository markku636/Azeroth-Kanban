import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { polishSceneField, SCENE_POLISH_FIELDS, type SceneField } from '@/lib/studio/scene-assist';
import { providerConfigured, resolveProvider } from '@/lib/studio/llm';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

// 故事場景單一欄位 AI 潤飾（synopsis/dialogue）。非破壞式，只回 { text } 不落庫（前端預填審核後存）。
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤'); }
    const field = str(body.field) as SceneField;
    if (!SCENE_POLISH_FIELDS.includes(field)) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '不支援的欄位');
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

    // 擁有權把關：非本人場景且無 EDIT_ALL → 擋（比照 scenes/[id]/expand）。
    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const scene = await prisma.scene.findFirst({ where: bypass ? { id } : { id, ownerId: memberId }, select: { id: true } });
    if (!scene) return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '找不到此場景');

    try {
      const out = await polishSceneField(id, field, text);
      if (!out || !out.trim()) return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 沒有產生內容，請再試一次');
      return ApiResponse.ok({ text: out }, 'AI 已潤飾');
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 潤飾失敗' + (raw ? `：${raw}` : ''));
    }
  },
);
