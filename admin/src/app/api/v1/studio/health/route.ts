import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 影像生成引擎（ComfyUI）就緒檢查。最常見的卡關是主機 sleep/idle 把 host ComfyUI 弄掉，
// 生成 job 會在佇列裡無聲地卡住。前端用此端點在生成前/旁邊提示「引擎尚未就緒」。
// 保留原本的 scheme（若設成 https 的 ComfyUI 也能正確探測，不會被降級成 http）。
const COMFY_URL = (process.env.COMFYUI_URL ?? '').replace(/\/+$/, '');
const TTS_URL = (process.env.SEAL_TTS_URL ?? '').replace(/\/+$/, '');

async function probeComfy(): Promise<{ configured: boolean; reachable: boolean; vramFreeGB?: number }> {
  if (!COMFY_URL) return { configured: false, reachable: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`${COMFY_URL}/system_stats`, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) return { configured: true, reachable: false };
    const data = (await r.json()) as { devices?: Array<{ vram_free?: number }> };
    const free = data?.devices?.[0]?.vram_free;
    return { configured: true, reachable: true, vramFreeGB: typeof free === 'number' ? Math.round((free / 1e9) * 10) / 10 : undefined };
  } catch {
    return { configured: true, reachable: false };
  } finally {
    clearTimeout(timer);
  }
}

// 配音服務（Seal-TTS）就緒檢查。含旁白(tts)的鏡在 TTS 掛時會生成失敗；/healthz 免金鑰。
async function probeTts(): Promise<{ configured: boolean; reachable: boolean }> {
  if (!TTS_URL) return { configured: false, reachable: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`${TTS_URL}/healthz`, { signal: ctrl.signal, cache: 'no-store' });
    return { configured: true, reachable: r.ok };
  } catch {
    return { configured: true, reachable: false };
  } finally {
    clearTimeout(timer);
  }
}

// 健康狀態是全域的（非每人不同）→ 短快取：多元件／多分頁同時輪詢時不重複探測，免打爆 ComfyUI/TTS。
let healthCache: { comfyui: Awaited<ReturnType<typeof probeComfy>>; tts: Awaited<ReturnType<typeof probeTts>>; at: number } | null = null;
const HEALTH_TTL_MS = 4000;

// GET：回 { comfyui: {configured,reachable,vramFreeGB?}, tts: {configured,reachable} }。登入即可查。
export async function GET() {
  const session = await auth();
  if (!session?.user?.memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) {
    return ApiResponse.ok({ comfyui: healthCache.comfyui, tts: healthCache.tts }, 'ok');
  }
  const [comfyui, tts] = await Promise.all([probeComfy(), probeTts()]);
  healthCache = { comfyui, tts, at: Date.now() };
  return ApiResponse.ok({ comfyui, tts }, 'ok');
}
