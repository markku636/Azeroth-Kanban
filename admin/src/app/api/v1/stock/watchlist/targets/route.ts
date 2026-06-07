import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { setWatchTargets } from '@/lib/stock-service';

/** 解析請求中的價格欄位：number → number；null/缺省 → null；其他型別 → undefined（視為非法）。 */
function parsePrice(value: unknown): number | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'number' ? value : undefined;
}

export const PUT = withPermission(PERMISSIONS.STOCK_WATCH_MANAGE, async (request: NextRequest) => {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) {
    return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  }
  let body: { symbol?: unknown; targetPrice?: unknown; stopPrice?: unknown };
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  if (typeof body.symbol !== 'string') {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, 'symbol 為必填');
  }
  const targetPrice = parsePrice(body.targetPrice);
  const stopPrice = parsePrice(body.stopPrice);
  if (targetPrice === undefined || stopPrice === undefined) {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '目標價 / 停損價需為數字或 null');
  }
  return ApiResponse.json(await setWatchTargets(memberId, body.symbol, targetPrice, stopPrice));
});
