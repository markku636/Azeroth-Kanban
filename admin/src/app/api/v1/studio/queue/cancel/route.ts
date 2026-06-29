import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { cancelJob } from '@/lib/orchestrator/queue-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 取消佇列任務：排隊中的直接移除；正在跑的會先請 ComfyUI 中斷再移除（best-effort）。
// 權限：STUDIO_EDIT（與排片/render 一致）；只能取消本人專案，除非具 STUDIO_EDIT_ALL。
export const POST = withPermission(PERMISSIONS.STUDIO_EDIT, async (request: NextRequest) => {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');

  let jobId: string | undefined;
  try {
    const body = (await request.json()) as { jobId?: string };
    if (typeof body?.jobId === 'string' && body.jobId.trim()) jobId = body.jobId.trim();
  } catch {
    /* 無 body → 下面擋掉 */
  }
  if (!jobId) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少 jobId');

  const viewAll = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
  const result = await cancelJob(jobId, { memberId, viewAll });

  if (result.ok) return ApiResponse.ok({ state: result.state }, result.message);

  const code =
    result.code === 'not_found'
      ? ApiReturnCode.NOT_FOUND
      : result.code === 'forbidden'
        ? ApiReturnCode.UNAUTHORIZED
        : ApiReturnCode.INTERNAL_ERROR; // locked / degraded
  return ApiResponse.fail(code, result.message);
});
