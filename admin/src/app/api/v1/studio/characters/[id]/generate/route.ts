import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { prisma } from '@/lib/prisma';
import { pipelineQueue } from '@/lib/orchestrator/queue';

export const runtime = 'nodejs';

// 用 AI（ComfyUI SDXL）依角色 appearance 生成角色形象圖（與「上傳形象圖」二擇一）。
// body 可選 { prompt }（補充描述）。生成在 worker 跑，產圖後設為角色 FaceID 主圖＋縮圖。
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const ch = await prisma.character.findFirst({
      where: bypass ? { id } : { id, ownerId: memberId },
      select: { id: true, appearance: true },
    });
    if (!ch) return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '找不到此角色');

    let prompt: string | undefined;
    try {
      const b = (await request.json()) as { prompt?: unknown };
      if (typeof b?.prompt === 'string' && b.prompt.trim()) prompt = b.prompt.trim();
    } catch { /* no body */ }

    if (!ch.appearance?.trim() && !prompt) {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請先填寫外觀描述（可按「優化」鈕）或補充提示，再生成形象圖');
    }

    const job = await pipelineQueue.add('character', {
      projectId: '', // 角色生圖不屬於任何專案
      mode: 'character',
      character: { characterId: id, prompt },
    });
    return ApiResponse.ok({ jobId: job.id }, '已排入生成角色形象圖（約 30–60 秒）');
  },
);
