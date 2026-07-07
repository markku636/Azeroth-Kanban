import type { NextRequest } from 'next/server';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { join, dirname } from 'node:path';
import { auth } from '@/auth';
import { ApiReturnCode } from '@/lib/api-response';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getProject } from '@/lib/studio-service';
import { projectOutputFile } from '@/lib/studio/storage';
import { Compositor } from '@/lib/engine/assemble';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 長片重編碼可達數分鐘

// 支援的重製畫幅 → 目標畫布（依成片品質選 720/1080 級）。
const TARGETS: Record<string, { w: number; h: number; hiW: number; hiH: number; slug: string }> = {
  '16:9': { w: 1280, h: 720, hiW: 1920, hiH: 1080, slug: '16x9' },
  '1:1': { w: 1024, h: 1024, hiW: 1536, hiH: 1536, slug: '1x1' },
  '9:16': { w: 720, h: 1280, hiW: 1080, hiH: 1920, slug: '9x16' },
};

// 平台重製下載：?aspect=16:9|1:1|9:16 → blur-pad 轉畫幅（不裁內容），快取（重製檔比 final.mp4 新則直接回）。
export async function GET(request: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return new Response('unauthorized', { status: 401 });
  if (!(await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW))) return new Response('forbidden', { status: 403 });
  const { id } = await params;
  const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
  const proj = await getProject(memberId, id, { bypassOwnership: bypass });
  if (proj.code !== ApiReturnCode.SUCCESS || !proj.data) return new Response('not found', { status: 404 });

  const aspect = new URL(request.url).searchParams.get('aspect') ?? '16:9';
  const target = TARGETS[aspect];
  if (!target) return new Response('aspect 僅支援 16:9 / 1:1 / 9:16', { status: 400 });
  if (aspect === (proj.data.aspect ?? '9:16')) return new Response('已是此畫幅，直接下載成片即可', { status: 400 });

  const final = projectOutputFile(id);
  if (!existsSync(final)) return new Response('not generated yet — 請先「② 生成影片」', { status: 404 });

  const hi = proj.data.renderQuality === 'high';
  const out = join(dirname(final), `repurpose_${target.slug}.mp4`);
  const fresh = existsSync(out) && statSync(out).mtimeMs >= statSync(final).mtimeMs;
  if (!fresh) {
    try {
      await new Compositor().repurpose({ video: final, out, width: hi ? target.hiW : target.w, height: hi ? target.hiH : target.h });
    } catch (e) {
      return new Response(`repurpose failed: ${e instanceof Error ? e.message.slice(0, 300) : 'unknown'}`, { status: 500 });
    }
  }
  const stat = statSync(out);
  const stream = Readable.toWeb(createReadStream(out)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="video_${target.slug}.mp4"`,
      'Cache-Control': 'no-cache',
    },
  });
}
