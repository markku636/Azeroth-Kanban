import type { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { auth } from '@/auth';
import { sfxFile, SFX_NAMES, type SfxName } from '@/lib/engine/sfx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 試聽內建卡點音效（vineboom/scratch/rimshot/ding/whoosh/boing）。純 TS 合成（無 GPU），
// 首次呼叫合成後快取於暫存目錄；回傳 audio/wav。僅供登入的 studio 使用者預覽，非專案資料。
export async function GET(_request: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  const session = await auth();
  if (!session?.user?.memberId) return new Response(JSON.stringify({ message: '尚未登入' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const { name } = await params;
  if (!SFX_NAMES.includes(name as SfxName)) return new Response(JSON.stringify({ message: '未知的音效' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  try {
    const p = sfxFile(name as SfxName, join(tmpdir(), 'studio-sfx-preview'));
    const buf = readFileSync(p);
    return new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'public, max-age=86400' } });
  } catch {
    return new Response(JSON.stringify({ message: '音效產生失敗' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
