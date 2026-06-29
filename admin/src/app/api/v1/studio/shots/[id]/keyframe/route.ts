import type { NextRequest } from 'next/server';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STORAGE = process.env.STUDIO_STORAGE_ROOT ?? join(process.cwd(), 'studio-storage');

// 串出某分鏡的關鍵幀縮圖（owner-scoped）。
// 先試 Shot.keyframePath（引擎寫入的絕對路徑），再退而求其次找 studio-storage 慣例路徑；都沒有回 404。
export async function GET(_req: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return new Response('unauthorized', { status: 401 });
  if (!(await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW))) return new Response('forbidden', { status: 403 });
  const { id } = await params;

  const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
  const shot = await prisma.shot.findFirst({
    where: bypass ? { id } : { id, ownerId: memberId },
    select: { projectId: true, keyframePath: true },
  });
  if (!shot) return new Response('not found', { status: 404 });

  const candidates = [
    shot.keyframePath ?? '',
    join(STORAGE, 'projects', shot.projectId, 'shots', id, 'keyframe.png'),
  ].filter(Boolean);
  const file = candidates.find((p) => existsSync(p));
  if (!file) return new Response('no keyframe', { status: 404 });

  const webStream = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
  return new Response(webStream, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
  });
}
