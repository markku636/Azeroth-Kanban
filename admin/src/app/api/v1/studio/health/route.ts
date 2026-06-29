import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 影像生成引擎（ComfyUI）就緒檢查。最常見的卡關是主機 sleep/idle 把 host ComfyUI 弄掉，
// 生成 job 會在佇列裡無聲地卡住。前端用此端點在生成前/旁邊提示「引擎尚未就緒」。
const COMFY_URL = process.env.COMFYUI_URL;
const COMFY_HOST = COMFY_URL ? COMFY_URL.replace(/^https?:\/\//, '') : '';

async function probeComfy(): Promise<{ configured: boolean; reachable: boolean; vramFreeGB?: number }> {
  if (!COMFY_HOST) return { configured: false, reachable: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`http://${COMFY_HOST}/system_stats`, { signal: ctrl.signal, cache: 'no-store' });
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

// GET：回 { comfyui: { configured, reachable, vramFreeGB? } }。登入即可查（不分專案）。
export async function GET() {
  const session = await auth();
  if (!session?.user?.memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  const comfyui = await probeComfy();
  return ApiResponse.ok({ comfyui }, 'ok');
}
