import type { NextRequest } from 'next/server';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject } from '@/lib/studio-service';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const STORAGE = process.env.STUDIO_STORAGE_ROOT ?? join(process.cwd(), 'studio-storage');
const ALLOWED = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac']);

async function ownProject(request: NextRequest, id: string) {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return { error: ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入') };
  const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
  const proj = await getProject(memberId, id, { bypassOwnership: bypass });
  if (proj.code !== ApiReturnCode.SUCCESS) return { error: ApiResponse.json(proj) };
  return { ok: true as const };
}

// 上傳專案 BGM（合成時循環/裁切到片長；未設定則用程序化 pad）。multipart：file=音檔, gain?=0–1
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { id } = await params;
    const guard = await ownProject(request, id);
    if (guard.error) return guard.error;

    let form: FormData;
    try { form = await request.formData(); } catch { return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '需以 multipart 上傳音檔'); }
    const file = form.get('file');
    if (!(file instanceof File)) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '缺少音檔');
    const ext = (extname(file.name) || '.mp3').toLowerCase();
    if (!ALLOWED.has(ext)) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '僅支援 mp3/wav/m4a/ogg/aac/flac');
    if (file.size > 50 * 1024 * 1024) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '音檔不可超過 50MB');

    const dir = join(STORAGE, 'projects', id, 'bgm');
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, `bgm${ext}`);
    writeFileSync(dest, Buffer.from(await file.arrayBuffer()));

    const gainRaw = form.get('gain');
    const gain = typeof gainRaw === 'string' && gainRaw.trim() ? Math.min(1, Math.max(0, Number(gainRaw))) : undefined;
    await prisma.studioProject.update({ where: { id }, data: { bgmPath: dest, ...(gain != null && !Number.isNaN(gain) ? { bgmGain: gain } : {}) } });
    return ApiResponse.ok({ id, bgm: `bgm${ext}` }, '已設定專案 BGM');
  },
);

// 清除專案 BGM → 回到程序化配樂
export const DELETE = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const { id } = await params;
    const guard = await ownProject(request, id);
    if (guard.error) return guard.error;
    await prisma.studioProject.update({ where: { id }, data: { bgmPath: null, bgmGain: null } });
    return ApiResponse.ok({ id }, '已清除，改用程序化配樂');
  },
);
