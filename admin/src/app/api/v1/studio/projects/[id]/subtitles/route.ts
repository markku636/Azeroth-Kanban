import type { NextRequest } from 'next/server';
import { readFileSync, existsSync } from 'node:fs';
import { auth } from '@/auth';
import { ApiReturnCode } from '@/lib/api-response';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject } from '@/lib/studio-service';
import { projectSubtitleFile, projectChaptersFile } from '@/lib/studio/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 下載成片字幕檔（owner-scoped）。?format=vtt → WebVTT；預設 SRT。附 Content-Disposition 觸發下載。
export async function GET(request: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return new Response('unauthorized', { status: 401 });
  if (!(await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW))) return new Response('forbidden', { status: 403 });
  const { id } = await params;
  const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
  const proj = await getProject(memberId, id, { bypassOwnership: bypass });
  if (proj.code !== ApiReturnCode.SUCCESS) return new Response('not found', { status: 404 });

  const fmt = new URL(request.url).searchParams.get('format');
  const isChapters = fmt === 'chapters';
  const isVtt = fmt === 'vtt';
  const file = isChapters ? projectChaptersFile(id) : projectSubtitleFile(id, isVtt ? 'vtt' : 'srt');
  if (!existsSync(file)) return new Response('not generated yet', { status: 404 });

  const body = readFileSync(file, 'utf8');
  const contentType = isChapters ? 'text/plain; charset=utf-8' : isVtt ? 'text/vtt; charset=utf-8' : 'application/x-subrip; charset=utf-8';
  const filename = isChapters ? 'chapters.txt' : `subtitles.${isVtt ? 'vtt' : 'srt'}`;
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  });
}
