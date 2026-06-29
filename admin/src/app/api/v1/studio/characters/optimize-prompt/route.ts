import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { providerConfigured } from '@/lib/studio/llm';
import {
  optimizeCharacterField,
  CHAR_FIELDS,
  ALLOWED_VERTEX_MODELS,
  DEFAULT_VERTEX_MODEL,
  type CharField,
  type AllowedVertexModel,
} from '@/lib/studio/character-assist';

// 角色 prompt 魔法棒：用 Gemini Vertex 優化單一角色欄位（persona/appearance/voiceInstruct）。
//   body: { field, text, name?, persona?, appearance?, model? }
// 集合層（無 [id]）：優化是純文字轉換、不讀不寫 Character，且要能在角色尚未儲存（id=null）時就用。
// 回傳 { text }（優化後文字），不落庫；前端預填欄位讓使用者檢視後再儲存。

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export const POST = withPermission(PERMISSIONS.STUDIO_EDIT, async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }

  const field = str(body.field) as CharField | undefined;
  if (!field || !CHAR_FIELDS.includes(field))
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '欄位不支援');

  const text = str(body.text) ?? ''; // 允許空字串（依脈絡從零生成）
  if (text.length > 4000)
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '文字過長，請精簡後再試');

  const reqModel = str(body.model);
  if (reqModel && !(ALLOWED_VERTEX_MODELS as readonly string[]).includes(reqModel))
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '不支援的模型');
  const model: AllowedVertexModel = (reqModel as AllowedVertexModel) ?? DEFAULT_VERTEX_MODEL;

  // 魔法棒一律走 Vertex（使用者指定）；未備齊 Vertex 憑證 → 友善提示。
  if (!providerConfigured('vertex'))
    return ApiResponse.fail(
      ApiReturnCode.INTERNAL_ERROR,
      'Gemini Vertex 尚未設定（需 GOOGLE_VERTEX_PROJECT 與 GOOGLE_VERTEX_CREDENTIALS）',
    );

  let optimized: string;
  try {
    optimized = await optimizeCharacterField({
      field,
      text,
      name: str(body.name),
      persona: str(body.persona),
      appearance: str(body.appearance),
      model,
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : '';
    return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 優化失敗' + (raw ? `：${raw}` : ''));
  }
  if (!optimized) return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, 'AI 沒有回傳內容，請再試一次');

  return ApiResponse.ok({ text: optimized }, 'AI 已優化');
});
