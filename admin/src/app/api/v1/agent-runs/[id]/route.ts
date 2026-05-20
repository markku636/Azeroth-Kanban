import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { PERMISSIONS } from '@/config/permissions';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { getAgentRun } from '@/lib/selkie-service';
import { withPermission } from '@/lib/with-permission';

type RouteCtx = { params: Promise<Record<string, string>> };

/** GET /api/v1/agent-runs/[id] —— 取得 triage 執行狀態與報告(前端輪詢) */
export const GET = withPermission(
  PERMISSIONS.INCIDENTS_VIEW,
  async (_request: NextRequest, { params }: RouteCtx) => {
    const session = await auth();
    if (!session?.user?.memberId) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    }
    const { id } = await params;
    return ApiResponse.json(await getAgentRun(id));
  },
);
