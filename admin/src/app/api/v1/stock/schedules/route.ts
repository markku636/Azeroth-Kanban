import type { NextRequest } from 'next/server';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { updateSchedule } from '@/lib/stock-service';

export const POST = withPermission(PERMISSIONS.STOCK_BOT_ADMIN, async (request: NextRequest) => {
  let body: {
    key?: unknown;
    hour?: unknown;
    minute?: unknown;
    weekdays?: unknown;
    enabled?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
  }
  if (typeof body.key !== 'string') {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, 'key 為必填');
  }
  const weekdays = Array.isArray(body.weekdays) ? body.weekdays.map(Number) : [];
  return ApiResponse.json(
    await updateSchedule(
      body.key,
      Number(body.hour),
      Number(body.minute),
      weekdays,
      body.enabled !== false,
    ),
  );
});
