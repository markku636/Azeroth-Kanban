import type { NextRequest } from 'next/server';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STORAGE = process.env.STUDIO_STORAGE_ROOT ?? join(process.cwd(), 'studio-storage');

// 串出某分鏡「已生成的影片」clip.mp4（owner-scoped），支援 HTTP Range 以利 <video> 拖曳/seek。
// 先試 DB 記錄的 lipsyncMp4 / i2vMp4（對嘴 / i2v 分支），再退回 studio-storage 慣例路徑
// （still / 喜劇 memeStill 分支只寫 clip.mp4、不落欄位）；都沒有回 404。
export async function GET(req: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return new Response('unauthorized', { status: 401 });
  if (!(await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW))) return new Response('forbidden', { status: 403 });
  const { id } = await params;

  const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
  const shot = await prisma.shot.findFirst({
    where: bypass ? { id } : { id, ownerId: memberId },
    select: { projectId: true, lipsyncMp4: true, i2vMp4: true },
  });
  if (!shot) return new Response('not found', { status: 404 });

  const candidates = [
    shot.lipsyncMp4 ?? '',
    shot.i2vMp4 ?? '',
    join(STORAGE, 'projects', shot.projectId, 'shots', id, 'clip.mp4'),
  ].filter(Boolean);
  const file = candidates.find((p) => existsSync(p));
  if (!file) return new Response('no clip', { status: 404 });

  const stat = statSync(file);
  const range = req.headers.get('range');
  const baseHeaders = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };

  // Range 請求 → 回 206 Partial Content（讓瀏覽器可拖曳進度條、邊下邊播）
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m) {
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
      return new Response('range not satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    }
    const last = Math.min(end, stat.size - 1);
    const stream = Readable.toWeb(createReadStream(file, { start, end: last })) as unknown as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...baseHeaders, 'Content-Length': String(last - start + 1), 'Content-Range': `bytes ${start}-${last}/${stat.size}` },
    });
  }

  const webStream = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
  return new Response(webStream, { headers: { ...baseHeaders, 'Content-Length': String(stat.size) } });
}
