import type { NextRequest } from 'next/server';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const STORAGE = process.env.STUDIO_STORAGE_ROOT ?? join(process.cwd(), 'studio-storage');

// 選定某歷史版本當「現役關鍵幀」（選 OK 的圖 / 選歷史的圖）：
// 複製該版本檔 → keyframe.png（影片管線只讀這個），並更新 keyframePath / selectedKeyframeId / status。
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

    let versionId: string | undefined;
    try { const body = (await request.json()) as { versionId?: string }; versionId = body?.versionId; } catch { /* no body */ }
    if (!versionId) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少 versionId');

    const version = await prisma.version.findFirst({
      where: { id: versionId, shotId: id, stage: 'keyframe' },
      select: { id: true, path: true },
    });
    if (!version) return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '找不到此版本');
    if (!version.path || !existsSync(version.path)) return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '版本檔案已遺失');

    const dir = join(STORAGE, 'projects', shot.projectId, 'shots', shot.id);
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, 'keyframe.png');
    copyFileSync(version.path, dest);
    await prisma.shot.update({
      where: { id: shot.id },
      data: { keyframePath: dest, selectedKeyframeId: version.id, status: 'KEYFRAME' },
    });

    return ApiResponse.ok({ id: shot.id, versionId: version.id }, '已設為關鍵幀');
  },
);
