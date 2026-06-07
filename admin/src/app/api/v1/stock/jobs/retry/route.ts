import type { NextRequest } from 'next/server';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { retryJob } from '@/lib/stock-service';

export const POST = withPermission(PERMISSIONS.STOCK_BOT_ADMIN, async (request: NextRequest) => {
  let body: { id?: unknown };
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  if (typeof body.id !== 'string') {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少 job id');
  }
  return ApiResponse.json(await retryJob(body.id));
});
