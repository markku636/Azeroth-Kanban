import type { NextRequest } from 'next/server';
import { ApiResponse } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { getJobs } from '@/lib/stock-service';

export const GET = withPermission(PERMISSIONS.STOCK_BOT_ADMIN, async (request: NextRequest) => {
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '50');
  const type = request.nextUrl.searchParams.get('type') ?? undefined;
  return ApiResponse.json(await getJobs(Number.isFinite(limit) ? limit : 50, type || undefined));
});
