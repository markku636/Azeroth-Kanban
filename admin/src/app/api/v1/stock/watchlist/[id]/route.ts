import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { removeWatch } from '@/lib/stock-service';

export const DELETE = withPermission(
  PERMISSIONS.STOCK_WATCH_MANAGE,
  async (_request: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    }
    const { id } = await context.params;
    return ApiResponse.json(await removeWatch(memberId, id));
  },
);
