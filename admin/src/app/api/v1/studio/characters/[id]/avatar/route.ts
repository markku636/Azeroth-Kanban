import type { NextRequest } from 'next/server';
import { createReadStream, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

// 串出角色形象圖（owner-scoped）：優先 avatarPath → faceIdRef → refImages[0]；都沒有回 404。
export async function GET(_req: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return new Response('unauthorized', { status: 401 });
  const { id } = await params;

  const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
  const character = await prisma.character.findFirst({
    where: bypass ? { id } : { id, ownerId: memberId },
    select: { avatarPath: true, faceIdRef: true, refImages: true },
  });
  if (!character) return new Response('not found', { status: 404 });

  const refs = Array.isArray(character.refImages) ? (character.refImages as unknown[]).filter((v): v is string => typeof v === 'string') : [];
  const candidates = [character.avatarPath ?? '', character.faceIdRef ?? '', refs[0] ?? ''].filter(Boolean);
  const file = candidates.find((p) => existsSync(p));
  if (!file) return new Response('no avatar', { status: 404 });

  const webStream = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
  return new Response(webStream, {
    headers: { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'image/png', 'Cache-Control': 'no-cache' },
  });
}
