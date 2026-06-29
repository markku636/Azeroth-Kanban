import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject } from '@/lib/studio-service';
import { pipelineQueue } from '@/lib/orchestrator/queue';

// 階段②：依關鍵幀生影片並合成整支。body 可選 { shotIds:[...] } 只重生指定鏡（改完重生），省略則全部。
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
    let sceneId: string | undefined;
    try {
      const body = (await request.json()) as { shotIds?: string[]; sceneId?: string };
      if (Array.isArray(body?.shotIds) && body.shotIds.length) shotIds = body.shotIds;
      if (typeof body?.sceneId === 'string' && body.sceneId && body.sceneId !== '__unassigned__') sceneId = body.sceneId;
    } catch { /* no body = all shots */ }

    const job = await pipelineQueue.add('render', { projectId: id, mode: 'render', shotIds, sceneId });
    const msg = sceneId ? '已排入生成本幕影片' : shotIds ? `已排入重生 ${shotIds.length} 鏡影片` : '已排入生成影片';
    return ApiResponse.ok({ jobId: job.id }, msg);
  },
);
