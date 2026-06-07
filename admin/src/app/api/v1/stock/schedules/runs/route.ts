import type { NextRequest } from 'next/server';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { getScheduleRuns } from '@/lib/stock-service';

/** 查某排程的執行紀錄（query `key` 必填、`limit` 預設 20）。 */
export const GET = withPermission(PERMISSIONS.STOCK_BOT_ADMIN, async (request: NextRequest) => {
  const key = request.nextUrl.searchParams.get('key');
  if (!key) {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, 'key 為必填');
  }
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '20');
  return ApiResponse.json(await getScheduleRuns(key, Number.isFinite(limit) ? limit : 20));
});
