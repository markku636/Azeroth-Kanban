import type { NextRequest } from 'next/server';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import {
  runBacktest,
  getBacktestResult,
  listBacktestRuns,
  deleteBacktestRun,
  deleteAllBacktestRuns,
  type BacktestInput,
} from '@/lib/stock-service';

/** POST：啟動一次策略回測（KD / 均線 / MACD / RSI / 布林；需後台管理權限，觸發背景運算 + 補抓資料）。 */
export const POST = withPermission(PERMISSIONS.STOCK_BOT_ADMIN, async (request: NextRequest) => {
  let body: Partial<BacktestInput>;
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  if (typeof body.symbol !== 'string' || !body.symbol.trim()) {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請提供股票代號');
  }
  return ApiResponse.json(await runBacktest(body as BacktestInput));
});

/** GET：?runId= 取單筆結果（輪詢）；否則回該代號 / 全部回測歷史列表。 */
export const GET = withPermission(PERMISSIONS.STOCK_SIGNAL_VIEW, async (request: NextRequest) => {
  const runId = request.nextUrl.searchParams.get('runId');
  if (runId) {
    return ApiResponse.json(await getBacktestResult(runId));
  }
  const symbol = request.nextUrl.searchParams.get('symbol') ?? undefined;
  return ApiResponse.json(await listBacktestRuns(symbol));
});

/** DELETE：?runId= 刪單筆；?all=true 清除歷史（可選 ?symbol= 限定代號）。需後台管理權限。 */
export const DELETE = withPermission(PERMISSIONS.STOCK_BOT_ADMIN, async (request: NextRequest) => {
  const runId = request.nextUrl.searchParams.get('runId');
  if (runId) {
    return ApiResponse.json(await deleteBacktestRun(runId));
  }
  if (request.nextUrl.searchParams.get('all') === 'true') {
    const symbol = request.nextUrl.searchParams.get('symbol') ?? undefined;
    return ApiResponse.json(await deleteAllBacktestRuns(symbol));
  }
  return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請提供 runId 或 all=true');
});
