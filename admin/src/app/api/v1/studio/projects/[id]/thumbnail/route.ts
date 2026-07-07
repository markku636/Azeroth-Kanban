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
import { Compositor, GRADE_STYLE_KEYS, THUMBNAIL_VARIANTS } from '@/lib/engine/assemble';
import { getStylePreset } from '@/lib/engine/style-preset';
import { contentDisposition } from '@/lib/studio/download-name';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 產生並下載 YouTube 封面縮圖（1280×720 JPG）：第一個有關鍵幀的鏡 ＋ 專案標題 ＋ 模板強調色 ＋ 專案調色 look。
// 每次呼叫即重生（標題/關鍵幀可能已改），owner-scoped。?variant=a|b|c 產出 A/B 變體（換標題位置與強調色）。
export async function GET(request: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
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
  // A/B 變體：?variant=a|b|c。找不到 → 沿用預設（等同無 variant，零回歸）。
  const variant = THUMBNAIL_VARIANTS.find((v) => v.key === request.nextUrl.searchParams.get('variant'));
  const baseOut = projectThumbnailFile(id);
  // 各變體寫獨立檔，避免並發請求互相覆寫（force-dynamic 每次重生）。
  const out = variant ? baseOut.replace(/\.jpg$/i, `-${variant.key}.jpg`) : baseOut;
  const suffix = variant ? `thumbnail-${variant.key}` : 'thumbnail';
  mkdirSync(dirname(out), { recursive: true });
  try {
    await new Compositor().thumbnail({ image: keyframe, out, title: proj.data.title, accent: variant?.accent ?? preset?.cards?.accent, grade: look ?? preset?.gradeStyle, titlePos: variant?.titlePos });
  } catch (e) {
    return new Response(`thumbnail failed: ${e instanceof Error ? e.message.slice(0, 300) : 'unknown'}`, { status: 500 });
  }
  return new Response(readFileSync(out), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': contentDisposition(proj.data.title, suffix, 'jpg'),
      'Cache-Control': 'no-cache',
    },
  });
}
