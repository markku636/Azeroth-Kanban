import type { NextRequest } from 'next/server';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { auth } from '@/auth';
import { ApiReturnCode } from '@/lib/api-response';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject } from '@/lib/studio-service';
import { prisma } from '@/lib/prisma';
import { projectDir } from '@/lib/studio/storage';
import { Compositor } from '@/lib/engine/assemble';
import { contentDisposition } from '@/lib/studio/download-name';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TILES = 36; // 6x6 直式已足供總覽；再多會小到不可辨

// 分鏡總覽圖下載：全部有關鍵幀的鏡拼成帶鏡號的網格 PNG（審稿/客戶確認）。每次即時重生（關鍵幀常重生）。
export async function GET(_request: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return new Response('unauthorized', { status: 401 });
  if (!(await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW))) return new Response('forbidden', { status: 403 });
  const { id } = await params;
  const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
  const proj = await getProject(memberId, id, { bypassOwnership: bypass });
  if (proj.code !== ApiReturnCode.SUCCESS || !proj.data) return new Response('not found', { status: 404 });

  const shots = await prisma.shot.findMany({
    where: { projectId: id, keyframePath: { not: null } },
    orderBy: { sortOrder: 'asc' },
    select: { keyframePath: true, shotNo: true },
  });
  const present = shots.filter((s) => s.keyframePath && existsSync(s.keyframePath)).slice(0, MAX_TILES);
  if (!present.length) return new Response('no keyframes yet — 請先「① 生成圖片」', { status: 404 });

  const out = join(projectDir(id), 'output', 'contact-sheet.png');
  mkdirSync(dirname(out), { recursive: true });
  try {
    await new Compositor().contactSheet({
      images: present.map((s) => s.keyframePath!),
      labels: present.map((s, i) => s.shotNo ?? i + 1),
      aspect: proj.data.aspect ?? '9:16',
      out,
    });
  } catch (e) {
    return new Response(`contact sheet failed: ${e instanceof Error ? e.message.slice(0, 300) : 'unknown'}`, { status: 500 });
  }
  return new Response(readFileSync(out), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': contentDisposition(proj.data.title ? proj.data.title + ' 分鏡' : null, 'storyboard', 'png'),
      'Cache-Control': 'no-cache',
    },
  });
}
