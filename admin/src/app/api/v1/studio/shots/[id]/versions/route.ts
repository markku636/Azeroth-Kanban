import type { NextRequest } from 'next/server';
import { existsSync } from 'node:fs';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { prisma } from '@/lib/prisma';

// 列出某分鏡的生成歷史版本（關鍵幀圖 + 影片），新到舊。供「查看歷史」UI。
export const GET = withPermission(
  PERMISSIONS.STUDIO_VIEW,
  async (_request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
    const shot = await prisma.shot.findFirst({
      where: bypass ? { id } : { id, ownerId: memberId },
      select: { id: true, selectedKeyframeId: true },
    });
    if (!shot) return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '找不到此分鏡');

    const rows = await prisma.version.findMany({
      where: { shotId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, stage: true, path: true, createdAt: true, meta: true },
    });
    // 過濾掉檔案已被清掉的歷史記錄，避免列出來點了 404。
    const alive = rows.filter((r) => { try { return existsSync(r.path); } catch { return false; } });
    // 現役關鍵幀：以 selectedKeyframeId 為準；未設則視最新一張關鍵幀為現役（洗圖工作台用來高亮）。
    const newestKeyframeId = alive.find((r) => r.stage === 'keyframe')?.id ?? null;
    const currentId = shot.selectedKeyframeId ?? newestKeyframeId;
    const versions = alive.map((r) => ({
      id: r.id, stage: r.stage, createdAt: r.createdAt, meta: r.meta ?? null,
      selected: r.stage === 'keyframe' && r.id === currentId,
    }));
    return ApiResponse.ok({ versions }, '取得歷史版本成功');
  },
);
