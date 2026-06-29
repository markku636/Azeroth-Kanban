import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject } from '@/lib/studio-service';
import { pipelineQueue } from '@/lib/orchestrator/queue';

// 恢復生成：核可分鏡 / 單鏡重生。body 即 LangGraph 的 resume 值，例如：
//   { approved: true }                          → 核可整個分鏡板，全跑
//   { approved: true, regen: ["<shotId>"] }     → 只重生指定鏡
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

    let resumeValue: unknown = { approved: true };
    try {
      resumeValue = await request.json();
    } catch {
      /* default approval */
    }
    const job = await pipelineQueue.add('resume', { projectId: id, resume: true, resumeValue });
    return ApiResponse.ok({ jobId: job.id }, '已恢復生成');
  },
);
