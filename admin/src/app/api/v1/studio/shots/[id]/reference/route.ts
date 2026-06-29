import type { NextRequest } from 'next/server';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const STORAGE = process.env.STUDIO_STORAGE_ROOT ?? join(process.cwd(), 'studio-storage');
const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.webp']);

// 上傳分鏡的參考圖。multipart：file=圖片, mode='upload'(直接當關鍵幀) | 'faceid'(參考重繪)。
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
    try { form = await request.formData(); } catch { return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '需以 multipart 上傳圖片'); }
    const file = form.get('file');
    const mode = (form.get('mode') as string) === 'faceid' ? 'faceid' : 'upload';
    if (!(file instanceof File)) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少圖片檔');

    const ext = (extname(file.name) || '.png').toLowerCase();
    if (!ALLOWED.has(ext)) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '僅支援 png/jpg/webp');
    if (file.size > 20 * 1024 * 1024) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '圖片不可超過 20MB');

    const dir = join(STORAGE, 'projects', shot.projectId, 'shots', shot.id);
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, `ref${ext}`);
    writeFileSync(dest, Buffer.from(await file.arrayBuffer()));

    // upload：上傳圖即關鍵幀，直接可生影片；faceid：當參考，之後「生成圖片」會以它重繪
    const data =
      mode === 'upload'
        ? { refImage: dest, keyframePath: dest, keyframeMode: 'upload', status: 'KEYFRAME' as const }
        : { refImage: dest, keyframeMode: 'faceid' };
    await prisma.shot.update({ where: { id: shot.id }, data });

    return ApiResponse.ok({ id: shot.id, mode }, mode === 'upload' ? '已上傳，將直接當關鍵幀' : '已上傳參考圖，請按「生成圖片」重繪');
  },
);
