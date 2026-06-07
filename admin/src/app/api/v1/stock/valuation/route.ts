import type { NextRequest } from 'next/server';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { getValuation } from '@/lib/stock-service';
import type { ValuationMetric } from '@azeroth/common';

const METRICS: ValuationMetric[] = ['PER', 'PBR', 'YIELD'];

export const GET = withPermission(PERMISSIONS.STOCK_SIGNAL_VIEW, async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const symbol = params.get('symbol');
  if (!symbol) {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少 symbol');
  }
  const raw = (params.get('metric') ?? 'PER').toUpperCase() as ValuationMetric;
  const metric = METRICS.includes(raw) ? raw : 'PER';
  return ApiResponse.json(await getValuation(symbol, metric));
});
