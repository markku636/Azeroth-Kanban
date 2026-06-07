import type { NextRequest } from 'next/server';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { triggerResearch } from '@/lib/stock-service';

export const POST = withPermission(PERMISSIONS.STOCK_BOT_ADMIN, async (request: NextRequest) => {
  let body: { symbol?: unknown };
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  return ApiResponse.json(
    await triggerResearch(typeof body.symbol === 'string' ? body.symbol : ''),
  );
});
