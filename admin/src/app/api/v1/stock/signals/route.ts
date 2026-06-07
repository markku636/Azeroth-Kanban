import type { NextRequest } from 'next/server';
import { ApiResponse } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { listSignals } from '@/lib/stock-service';

export const GET = withPermission(PERMISSIONS.STOCK_SIGNAL_VIEW, async (request: NextRequest) => {
  const symbol = request.nextUrl.searchParams.get('symbol') ?? undefined;
  return ApiResponse.json(await listSignals(symbol));
});
