import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getQueueStatus } from '@/lib/orchestrator/queue-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GPU 佇列：現在 GPU 在跑什麼 + 還有什麼排隊沒跑。GPU 是共用單卡(worker concurrency=1)，故回整條佇列；
// 但比照本 app 擁有權模型：無 STUDIO_VIEW_ALL 時，他人專案只露「被佔用/排隊位置」，遮蔽標題與分鏡文字。
export const GET = withPermission(PERMISSIONS.STUDIO_VIEW, async (_request: NextRequest) => {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  const viewAll = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
  const status = await getQueueStatus({ memberId, viewAll });
  return ApiResponse.ok(status);
});
