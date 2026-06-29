import type { NextRequest } from 'next/server';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { prisma } from '@/lib/prisma';
import { pipelineQueue } from '@/lib/orchestrator/queue';

export const runtime = 'nodejs';

const STORAGE = process.env.STUDIO_STORAGE_ROOT ?? join(process.cwd(), 'studio-storage');

// 洗圖：在現有關鍵幀上做 img2img 微調（整張）或 inpaint 局部重繪（圈選遮罩），排入佇列產生「新版本」，
// 不覆蓋現役關鍵幀（使用者比較前後後再 /select 採用）。
// multipart：mode(img2img|inpaint), instruction?, denoise?, baseVersionId?, mask?(PNG，inpaint 必附，白=改/黑=留)
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const shot = await prisma.shot.findFirst({
      where: bypass ? { id } : { id, ownerId: memberId },
      select: { id: true, projectId: true },
    });
    if (!shot) return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '找不到此分鏡');

    let form: FormData;
    try { form = await request.formData(); } catch { return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '需以 multipart 送出'); }

    const refineMode = (form.get('mode') as string) === 'inpaint' ? 'inpaint' : 'img2img';
    const instruction = ((form.get('instruction') as string) ?? '').trim() || undefined;
    const denoiseRaw = form.get('denoise') as string | null;
    const denoise = denoiseRaw != null && denoiseRaw !== '' ? Math.min(1, Math.max(0.05, Number(denoiseRaw))) : undefined;
    const baseVersionId = ((form.get('baseVersionId') as string) ?? '').trim() || undefined;

    // inpaint 必附遮罩；img2img 至少要有指令，否則沒東西可洗。
    let maskPath: string | undefined;
    if (refineMode === 'inpaint') {
      const maskFile = form.get('mask');
      if (!(maskFile instanceof File)) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, 'inpaint 需附遮罩圖（請圈選要改的區域）');
      if (maskFile.size > 12 * 1024 * 1024) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '遮罩圖過大');
      const dir = join(STORAGE, 'projects', shot.projectId, 'shots', shot.id, 'masks');
      mkdirSync(dir, { recursive: true });
      maskPath = join(dir, `mask_${Date.now()}.png`);
      writeFileSync(maskPath, Buffer.from(await maskFile.arrayBuffer()));
    } else if (!instruction) {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請輸入微調指令，或改用 inpaint 圈選區域');
    }

    const job = await pipelineQueue.add('refine', {
      projectId: shot.projectId,
      mode: 'refine',
      refine: { shotId: shot.id, refineMode, instruction, denoise, baseVersionId, maskPath },
    });
    return ApiResponse.ok({ jobId: job.id }, '已排入洗圖，完成後會出現新版本');
  },
);
