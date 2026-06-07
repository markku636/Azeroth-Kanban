import type { NextRequest } from 'next/server';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { getStrategyAnalysis } from '@/lib/stock-service';

export const GET = withPermission(PERMISSIONS.STOCK_SIGNAL_VIEW, async (request: NextRequest) => {
  const symbol = request.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少 symbol');
  }
  return ApiResponse.json(await getStrategyAnalysis(symbol));
});
