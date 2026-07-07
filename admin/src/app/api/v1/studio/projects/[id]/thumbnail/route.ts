import type { NextRequest } from 'next/server';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { auth } from '@/auth';
import { ApiReturnCode } from '@/lib/api-response';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject } from '@/lib/studio-service';
import { prisma } from '@/lib/prisma';
import { projectThumbnailFile } from '@/lib/studio/storage';
import { Compositor, GRADE_STYLE_KEYS } from '@/lib/engine/assemble';
import { getStylePreset } from '@/lib/engine/style-preset';
import { contentDisposition } from '@/lib/studio/download-name';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 產生並下載 YouTube 封面縮圖（1280×720 JPG）：第一個有關鍵幀的鏡 ＋ 專案標題 ＋ 模板強調色 ＋ 專案調色 look。
// 每次呼叫即重生（標題/關鍵幀可能已改），owner-scoped。
export async function GET(_request: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return new Response('unauthorized', { status: 401 });
  if (!(await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW))) return new Response('forbidden', { status: 403 });
  const { id } = await params;
  const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
  const proj = await getProject(memberId, id, { bypassOwnership: bypass });
  if (proj.code !== ApiReturnCode.SUCCESS || !proj.data) return new Response('not found', { status: 404 });

  // 素材：第一個有關鍵幀（檔案存在）的鏡
  const shots = await prisma.shot.findMany({ where: { projectId: id, keyframePath: { not: null } }, orderBy: { sortOrder: 'asc' }, select: { keyframePath: true } });
  const keyframe = shots.map((s) => s.keyframePath!).find((p) => existsSync(p));
  if (!keyframe) return new Response('no keyframe yet — 請先「① 生成圖片」', { status: 404 });

  const preset = getStylePreset(proj.data.stylePreset ?? null);
  const look = proj.data.look && GRADE_STYLE_KEYS.includes(proj.data.look) ? proj.data.look : undefined;
  const out = projectThumbnailFile(id);
  mkdirSync(dirname(out), { recursive: true });
  try {
    await new Compositor().thumbnail({ image: keyframe, out, title: proj.data.title, accent: preset?.cards?.accent, grade: look ?? preset?.gradeStyle });
  } catch (e) {
    return new Response(`thumbnail failed: ${e instanceof Error ? e.message.slice(0, 300) : 'unknown'}`, { status: 500 });
  }
  return new Response(readFileSync(out), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': contentDisposition(proj.data.title, 'thumbnail', 'jpg'),
      'Cache-Control': 'no-cache',
    },
  });
}
