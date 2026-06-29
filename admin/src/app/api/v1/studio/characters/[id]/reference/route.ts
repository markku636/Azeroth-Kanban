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

// 上傳角色參考圖（multipart：file=圖片，primary='1' 設為 FaceID 主參考）。會 append 到 refImages。
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const character = await prisma.character.findFirst({
      where: bypass ? { id } : { id, ownerId: memberId },
      select: { id: true, refImages: true, faceIdRef: true },
    });
    if (!character) return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '找不到此角色');

    let form: FormData;
    try { form = await request.formData(); } catch { return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '需以 multipart 上傳圖片'); }
    const file = form.get('file');
    const primary = (form.get('primary') as string) === '1';
    if (!(file instanceof File)) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少圖片檔');

    const ext = (extname(file.name) || '.png').toLowerCase();
    if (!ALLOWED.has(ext)) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '僅支援 png/jpg/webp');
    if (file.size > 20 * 1024 * 1024) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '圖片不可超過 20MB');

    const dir = join(STORAGE, 'characters', character.id);
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, `ref_${Date.now()}${ext}`);
    writeFileSync(dest, Buffer.from(await file.arrayBuffer()));

    const existing = Array.isArray(character.refImages) ? (character.refImages as unknown[]).filter((v): v is string => typeof v === 'string') : [];
    const refImages = [...existing, dest];
    // 首張或標記 primary → 設為 FaceID 主參考 + 角色縮圖。
    const setPrimary = primary || !character.faceIdRef;
    await prisma.character.update({
      where: { id: character.id },
      data: { refImages, ...(setPrimary ? { faceIdRef: dest, avatarPath: dest } : {}) },
    });

    return ApiResponse.ok({ id: character.id, path: dest, primary: setPrimary }, '已上傳角色參考圖');
  },
);
