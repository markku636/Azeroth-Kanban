import type { NextRequest } from 'next/server';
import { ApiResponse } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { listReports } from '@/lib/stock-service';

export const GET = withPermission(PERMISSIONS.STOCK_REPORT_VIEW, async (request: NextRequest) => {
  const symbol = request.nextUrl.searchParams.get('symbol') ?? undefined;
  return ApiResponse.json(await listReports(symbol));
});
