import { getMode, normalizeMode, setMode } from '@/lib/chaos';

export const dynamic = 'force-dynamic';

/** GET /api/chaos —— 查目前故障模式。 */
export function GET() {
  return Response.json({ mode: getMode() });
}

/** POST /api/chaos —— 設定故障模式。body: { "mode": "memory-leak" | "error-5xx" | ... } */
export async function POST(request: Request) {
  let body: { mode?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* 忽略不合法的 body,視為 none */
  }
  const mode = normalizeMode(body.mode);
  setMode(mode);
  return Response.json({ mode });
}
