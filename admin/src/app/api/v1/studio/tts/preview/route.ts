import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { SealTTSClient } from '@/lib/engine/voiceover';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEAL_URL = process.env.SEAL_TTS_URL ?? 'http://192.168.50.57:7866';
const SEAL_KEY = process.env.SEAL_TTS_API_KEY ?? '';

// 角色語音試聽：用指定 speaker/lora/engine/instruct 合一句短句，回 audio/wav。
export async function POST(request: NextRequest) {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return new Response(JSON.stringify({ message: '尚未登入' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  let body: { speaker?: unknown; text?: unknown; loraScale?: unknown; engine?: unknown; instruct?: unknown };
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ message: '請求格式錯誤' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

  const speaker = typeof body.speaker === 'string' && body.speaker.trim() ? body.speaker.trim() : 'default';
  const text = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : '你好，這是這個角色的聲音試聽。';
  const loraScale = typeof body.loraScale === 'number' ? body.loraScale : undefined;
  const engine = typeof body.engine === 'string' && body.engine.trim() ? body.engine.trim() : undefined;
  const instruct = typeof body.instruct === 'string' && body.instruct.trim() ? body.instruct.trim() : undefined;

  try {
    const tts = new SealTTSClient(SEAL_URL, SEAL_KEY);
    const r = await tts.synth({ speaker, text, loraScale, engine, instruct, timeoutMs: 60_000 });
    return new Response(new Uint8Array(r.wav), { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const friendly = /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|timed?\s*out|aborted/i.test(msg)
      ? `配音伺服器(Seal-TTS)連線失敗：${SEAL_URL} 無回應，請先確認 TTS 服務已啟動。`
      : `試聽失敗：${msg}`;
    return new Response(JSON.stringify({ message: friendly }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
}
