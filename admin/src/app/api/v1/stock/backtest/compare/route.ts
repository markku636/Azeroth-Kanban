import type { NextRequest } from 'next/server';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import {
  runComparison,
  getComparison,
  listBacktestBatches,
  deleteComparison,
  type ComparisonInput,
} from '@/lib/stock-service';

/** POST：啟動一次策略比較（需後台管理權限，會觸發背景運算 + 補抓資料）。 */
export const POST = withPermission(PERMISSIONS.STOCK_BOT_ADMIN, async (request: NextRequest) => {
  let body: Partial<ComparisonInput>;
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  if (typeof body.symbol !== 'string' || !body.symbol.trim()) {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請提供股票代號');
  }
  if (!Array.isArray(body.entries) || body.entries.length < 2) {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '至少需選擇 2 個策略才能比較');
  }
  return ApiResponse.json(await runComparison(body as ComparisonInput));
});

/** GET：?batchId= 取單筆比較結果（輪詢）；否則回該代號 / 全部比較歷史列表。 */
export const GET = withPermission(PERMISSIONS.STOCK_SIGNAL_VIEW, async (request: NextRequest) => {
  const batchId = request.nextUrl.searchParams.get('batchId');
  if (batchId) {
    return ApiResponse.json(await getComparison(batchId));
  }
  const symbol = request.nextUrl.searchParams.get('symbol') ?? undefined;
  return ApiResponse.json(await listBacktestBatches(symbol));
});

/** DELETE：?batchId= 刪除比較批次（子回測經外鍵級聯一併刪除）。需後台管理權限。 */
export const DELETE = withPermission(PERMISSIONS.STOCK_BOT_ADMIN, async (request: NextRequest) => {
  const batchId = request.nextUrl.searchParams.get('batchId');
  if (!batchId) {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請提供 batchId');
  }
  return ApiResponse.json(await deleteComparison(batchId));
});
