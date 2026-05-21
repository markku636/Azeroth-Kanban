/**
 * GET /api/v1/public/status —— 對外 status page 的資料來源。
 *
 * 存取控制(token-gated,非完全公開):
 *   - 需在網址帶 ?key=<STATUS_PAGE_KEY>,或用 x-status-key 標頭。
 *   - 未設定 STATUS_PAGE_KEY 環境變數時,整個端點 fail-closed 回 503。
 *   - 不掛 withPermission / SSO auth —— 改用「共享金鑰」這種輕量授權,
 *     讓沒有後台帳號的合作夥伴也能用連結看,但不對隨機訪客 / 爬蟲裸奔。
 *   - 要完全公開:把下方「存取金鑰驗證」整段移除即可。
 *
 * 安全:即使帶對 key,也只回傳脫敏欄位 —— 服務名稱、分組、目前狀態、
 *      uptime%、heartbeat 結果。不回傳 url / tcpHost / pushToken / service /
 *      內部 detail 字串 / ownerId,heartbeat 也只給 result + checkedAt。
 */
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

/** 永遠即時計算,不要被 Next 靜態快取。 */
export const dynamic = 'force-dynamic';

interface PublicHeartbeat {
  result: string;
  checkedAt: string;
}

interface PublicService {
  name: string;
  state: string;
  uptime24h: number | null;
  uptime7d: number | null;
  heartbeats: PublicHeartbeat[];
}

interface PublicGroup {
  name: string;
  services: PublicService[];
}

interface PublicStatus {
  generatedAt: string;
  /** operational = 全部正常;down = 至少一個 DOWN;maintenance = 沒有 DOWN 但有維護中 */
  overall: 'operational' | 'down' | 'maintenance';
  groups: PublicGroup[];
}

/** OK / FAIL 才納入 uptime 計算(排除 SKIPPED / MAINTENANCE)。 */
function uptimePct(checks: Array<{ result: string }>): number | null {
  const considered = checks.filter((c) => c.result === 'OK' || c.result === 'FAIL');
  if (considered.length === 0) return null;
  const ok = considered.filter((c) => c.result === 'OK').length;
  return (ok / considered.length) * 100;
}

export async function GET(request: Request) {
  // ── 存取金鑰驗證 ──
  const expectedKey = process.env.STATUS_PAGE_KEY;
  if (!expectedKey) {
    return ApiResponse.fail(
      ApiReturnCode.INTERNAL_ERROR,
      'status page 未啟用(未設定 STATUS_PAGE_KEY)',
    );
  }
  const providedKey =
    new URL(request.url).searchParams.get('key') ?? request.headers.get('x-status-key');
  if (providedKey !== expectedKey) {
    return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '存取金鑰錯誤或缺少 ?key=');
  }

  try {
    const monitors = await prisma.monitor.findMany({
      where: { enabled: true },
      select: { id: true, name: true, state: true, groupName: true },
      orderBy: { name: 'asc' },
    });

    if (monitors.length === 0) {
      return ApiResponse.ok<PublicStatus>(
        { generatedAt: new Date().toISOString(), overall: 'operational', groups: [] },
        '取得狀態成功',
      );
    }

    const now = Date.now();
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const since24h = new Date(now - 24 * 60 * 60 * 1000);

    // 一次撈 7d 內、所有 enabled monitor 的 check,再 in-memory 分組。
    const checks = await prisma.monitorCheck.findMany({
      where: {
        monitorId: { in: monitors.map((m) => m.id) },
        checkedAt: { gte: since7d },
      },
      select: { monitorId: true, result: true, checkedAt: true },
      orderBy: { checkedAt: 'desc' },
      take: 8000,
    });

    const byMonitor = new Map<string, Array<{ result: string; checkedAt: Date }>>();
    for (const c of checks) {
      const arr = byMonitor.get(c.monitorId) ?? [];
      arr.push({ result: c.result, checkedAt: c.checkedAt });
      byMonitor.set(c.monitorId, arr);
    }

    const groupMap = new Map<string, PublicService[]>();
    for (const m of monitors) {
      const mChecks = byMonitor.get(m.id) ?? [];
      const checks24h = mChecks.filter((c) => c.checkedAt >= since24h);
      const heartbeats: PublicHeartbeat[] = mChecks
        .slice(0, 50)
        .map((c) => ({ result: c.result, checkedAt: c.checkedAt.toISOString() }));
      const service: PublicService = {
        name: m.name,
        state: m.state,
        uptime24h: uptimePct(checks24h),
        uptime7d: uptimePct(mChecks),
        heartbeats,
      };
      const key = m.groupName ?? '未分組';
      const arr = groupMap.get(key) ?? [];
      arr.push(service);
      groupMap.set(key, arr);
    }

    const groups: PublicGroup[] = Array.from(groupMap.entries()).map(([name, services]) => ({
      name,
      services,
    }));

    const states = monitors.map((m) => m.state);
    let overall: PublicStatus['overall'] = 'operational';
    if (states.includes('DOWN')) overall = 'down';
    else if (states.includes('MAINTENANCE')) overall = 'maintenance';

    return ApiResponse.ok<PublicStatus>(
      { generatedAt: new Date().toISOString(), overall, groups },
      '取得狀態成功',
    );
  } catch (e) {
    console.error('[api.public.status]', e);
    return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, '取得狀態失敗');
  }
}
