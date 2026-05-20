/**
 * POST /api/v1/monitors/test —— 測試一次草稿設定(不存 DB、不開事故)。
 *
 * 給「新增監控」表單用:使用者填完欄位後按「測試一次」,直接拿到 OK/FAIL/SKIPPED + detail,
 * 確認設定 OK 再存。
 *
 * 注意:這只跑單次 check,不過閘門(維護視窗 / 活躍時段 / 父相依),也不會誤觸引擎狀態機。
 */
import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { PERMISSIONS } from '@/config/permissions';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { runDraft } from '@/lib/monitor-engine';
import { withPermission } from '@/lib/with-permission';

export const POST = withPermission(PERMISSIONS.MONITORS_CREATE, async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.memberId) {
    return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  if (!body || typeof body !== 'object') {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  try {
    const result = await runDraft(body as Record<string, unknown>);
    return ApiResponse.ok(result, '測試完成');
  } catch (e) {
    console.error('[api.monitors.test]', e);
    return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, '測試失敗');
  }
});
