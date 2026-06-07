import type { NextRequest } from 'next/server';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { runScheduleNow } from '@/lib/stock-service';

/** 手動立即執行某排程（body `{ key }`）。 */
export const POST = withPermission(PERMISSIONS.STOCK_BOT_ADMIN, async (request: NextRequest) => {
  let body: { key?: unknown };
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  if (typeof body.key !== 'string') {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, 'key 為必填');
  }
  return ApiResponse.json(await runScheduleNow(body.key));
});
