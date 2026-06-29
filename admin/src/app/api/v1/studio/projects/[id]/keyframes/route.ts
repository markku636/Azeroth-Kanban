import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject } from '@/lib/studio-service';
import { pipelineQueue } from '@/lib/orchestrator/queue';

// 階段①：只生成關鍵幀圖片（先圖後片）。body 可選 { shotIds:[...] } 只生指定鏡，省略則全部。
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;
    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const proj = await getProject(memberId, id, { bypassOwnership: bypass });
    if (proj.code !== ApiReturnCode.SUCCESS) return ApiResponse.json(proj);

    let shotIds: string[] | undefined;
    try {
      const body = (await request.json()) as { shotIds?: string[] };
      if (Array.isArray(body?.shotIds) && body.shotIds.length) shotIds = body.shotIds;
    } catch { /* no body = all shots */ }

    const job = await pipelineQueue.add('keyframes', { projectId: id, mode: 'keyframes', shotIds });
    return ApiResponse.ok({ jobId: job.id }, shotIds ? `已排入生成 ${shotIds.length} 鏡圖片` : '已排入生成全部圖片');
  },
);
