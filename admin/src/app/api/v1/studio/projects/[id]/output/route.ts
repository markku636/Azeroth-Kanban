import type { NextRequest } from 'next/server';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { auth } from '@/auth';
import { ApiReturnCode } from '@/lib/api-response';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject } from '@/lib/studio-service';
import { projectOutputFile } from '@/lib/studio/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 串出成片 final.mp4（owner-scoped），支援 HTTP Range 讓 <video> 可拖曳/seek、邊下邊播。
export async function GET(request: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return new Response('unauthorized', { status: 401 });
  const { id } = await params;
  const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
  const proj = await getProject(memberId, id, { bypassOwnership: bypass });
  if (proj.code !== ApiReturnCode.SUCCESS) return new Response('not found', { status: 404 });

  const file = projectOutputFile(id);
  if (!existsSync(file)) return new Response('not generated yet', { status: 404 });

  const stat = statSync(file);
  const range = request.headers.get('range');
  const baseHeaders = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };

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
