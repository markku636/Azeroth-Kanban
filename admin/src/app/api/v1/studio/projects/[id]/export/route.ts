import type { NextRequest } from 'next/server';
import { createReadStream, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject } from '@/lib/studio-service';
import { pipelineQueue } from '@/lib/orchestrator/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STORAGE = process.env.STUDIO_STORAGE_ROOT ?? join(process.cwd(), 'studio-storage');
const MIME: Record<string, string> = { gif: 'image/gif', webm: 'video/webm' };
const fmtOf = (v: string | null | undefined): 'gif' | 'webm' => (v === 'webm' ? 'webm' : 'gif');
const exportPath = (id: string, fmt: string) => join(STORAGE, 'projects', id, 'output', `export.${fmt}`);

// POST：排入把成片 final.mp4 轉成 gif/webm 的匯出工作（ffmpeg 在 worker）。
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;
    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const proj = await getProject(memberId, id, { bypassOwnership: bypass });
    if (proj.code !== ApiReturnCode.SUCCESS) return ApiResponse.json(proj);

    let fmt: 'gif' | 'webm' = 'gif';
    try { const b = (await request.json()) as { format?: string }; if (b?.format === 'webm') fmt = 'webm'; } catch { /* default gif */ }
    try { rmSync(exportPath(id, fmt), { force: true }); } catch { /* 砍舊檔讓前端輪詢偵測新檔 */ }

    const job = await pipelineQueue.add('export', { projectId: id, mode: 'export', exportFormat: fmt });
    return ApiResponse.ok({ jobId: job.id, format: fmt }, `已排入匯出 ${fmt}`);
  },
);

// GET ?check=1 → 回 { ready } 供輪詢；否則串出檔案下載。owner-scoped。
export async function GET(request: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return new Response('unauthorized', { status: 401 });
  const { id } = await params;
  const url = new URL(request.url);
  const fmt = fmtOf(url.searchParams.get('format'));
  const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
  const proj = await getProject(memberId, id, { bypassOwnership: bypass });
  if (proj.code !== ApiReturnCode.SUCCESS) return new Response('not found', { status: 404 });

  const file = exportPath(id, fmt);
  const ready = existsSync(file);
  if (url.searchParams.get('check') === '1') {
    return new Response(JSON.stringify({ ready }), { headers: { 'Content-Type': 'application/json' }, status: 200 });
  }
  if (!ready) return new Response('not ready', { status: 404 });
  const webStream = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
  const name = `${(proj.data?.title ?? 'export').replace(/[^\w一-鿿-]+/g, '_')}.${fmt}`;
  return new Response(webStream, {
    headers: { 'Content-Type': MIME[fmt], 'Cache-Control': 'no-cache', 'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}"` },
  });
}
