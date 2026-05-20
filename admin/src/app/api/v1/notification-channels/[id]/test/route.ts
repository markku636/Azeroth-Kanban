import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { PERMISSIONS } from '@/config/permissions';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { testChannel } from '@/lib/notification-channel-service';
import { withPermission } from '@/lib/with-permission';

type RouteCtx = { params: Promise<Record<string, string>> };

/** POST /api/v1/notification-channels/[id]/test —— 發一條假事件確認通道可用 */
export const POST = withPermission(
  PERMISSIONS.NOTIFICATION_CHANNELS_EDIT,
  async (_request: NextRequest, { params }: RouteCtx) => {
    const session = await auth();
    if (!session?.user?.memberId) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    }
    const { id } = await params;
    return ApiResponse.json(await testChannel(id));
  },
);
