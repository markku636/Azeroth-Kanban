import type { NextRequest } from 'next/server';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { getFundamental } from '@/lib/stock-service';
import { parseWeights, type ScoringStrategyId } from '@azeroth/common';

export const GET = withPermission(PERMISSIONS.STOCK_SIGNAL_VIEW, async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const symbol = params.get('symbol');
  if (!symbol) {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少 symbol');
  }
  const weights = parseWeights(params.get('weights'));
  const strategy = weights ?? (params.get('strategy') as ScoringStrategyId | null) ?? 'balanced';
  return ApiResponse.json(await getFundamental(symbol, strategy));
});
