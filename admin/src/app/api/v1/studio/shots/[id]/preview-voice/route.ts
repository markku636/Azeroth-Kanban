import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { prisma } from '@/lib/prisma';
import { SealTTSClient } from '@/lib/engine/voiceover';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEAL_URL = process.env.SEAL_TTS_URL ?? 'http://192.168.50.57:7866';
const SEAL_KEY = process.env.SEAL_TTS_API_KEY ?? '';

// 試聽某分鏡的旁白（用與生成完全相同的聲音設定：shot.speaker + shot.emotion 當情緒 instruct + 指派角色的 lora/引擎）。
export async function POST(_request: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return new Response(JSON.stringify({ message: '尚未登入' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (!(await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW))) {
    return new Response(JSON.stringify({ message: '沒有權限' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  const { id } = await params;

  const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_VIEW_ALL);
  const shot = await prisma.shot.findFirst({
    where: bypass ? { id } : { id, ownerId: memberId },
    select: { tts: true, speaker: true, emotion: true, characterId: true },
  });
  if (!shot) return new Response(JSON.stringify({ message: '找不到此分鏡' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  if (!shot.tts?.trim()) return new Response(JSON.stringify({ message: '此分鏡尚無旁白可試聽' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const character = shot.characterId ? await prisma.character.findUnique({ where: { id: shot.characterId } }) : null;

  try {
    const tts = new SealTTSClient(SEAL_URL, SEAL_KEY);
    const r = await tts.synth({
      speaker: shot.speaker ?? 'default',
      text: shot.tts,
      instruct: shot.emotion ?? character?.voiceInstruct ?? undefined, // ← 帶情緒
      loraScale: character?.loraScale ?? undefined,
      engine: character?.ttsEngine ?? undefined,
      timeoutMs: 60_000,
    });
    return new Response(new Uint8Array(r.wav), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const friendly = /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|timed?\s*out|aborted/i.test(msg)
      ? `配音伺服器(Seal-TTS)連線失敗：${SEAL_URL} 無回應，請先確認 TTS 服務已啟動。`
      : `試聽失敗：${msg}`;
    return new Response(JSON.stringify({ message: friendly }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
}
