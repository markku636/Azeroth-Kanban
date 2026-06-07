import type { NextRequest } from 'next/server';
import { ApiResponse } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { getScreener } from '@/lib/stock-service';
import { parseWeights, type ScoringStrategyId } from '@azeroth/common';

export const GET = withPermission(PERMISSIONS.STOCK_SIGNAL_VIEW, async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const strategy = params.get('strategy') ?? 'all';
  // 評分策略：自訂權重（weights）優先，其次 scoring preset id，預設綜合。
  const weights = parseWeights(params.get('weights'));
  const scoring = weights ?? (params.get('scoring') as ScoringStrategyId | null) ?? 'balanced';
  return ApiResponse.json(await getScreener(strategy, 30, scoring));
});
