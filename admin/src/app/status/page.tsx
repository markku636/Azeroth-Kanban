/**
 * /status —— 對外公開的服務狀態頁(Uptime Kuma 的「Status Page」)。
 *
 * 免登入:middleware 的 OPEN_PATHS 已放行 /status。
 * 資料來自 GET /api/v1/public/status(脫敏端點)。
 *
 * 此頁在 (dashboard) route group 之外,所以不帶 admin sidebar,
 * 只吃 root layout —— 適合直接分享給用戶 / 合作夥伴。
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { PiPulseDuotone } from 'react-icons/pi';

import { HeartbeatBar } from '@/components/monitors/HeartbeatBar';

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
  overall: 'operational' | 'down' | 'maintenance';
  groups: PublicGroup[];
}

const OVERALL: Record<PublicStatus['overall'], { label: string; cls: string; dot: string }> = {
  operational: {
    label: '所有系統運作正常',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    dot: 'bg-emerald-500',
  },
  down: {
    label: '部分服務發生異常',
    cls: 'border-rose-200 bg-rose-50 text-rose-800',
    dot: 'bg-rose-500',
  },
  maintenance: {
    label: '部分服務維護中',
    cls: 'border-amber-200 bg-amber-50 text-amber-800',
    dot: 'bg-amber-500',
  },
};

const STATE_LABEL: Record<string, string> = {
  UP: '正常',
  DOWN: '異常',
  PENDING: '等待中',
  PAUSED: '已停用',
  MAINTENANCE: '維護中',
};
const STATE_DOT: Record<string, string> = {
  UP: 'bg-emerald-500',
  DOWN: 'bg-rose-500',
  PENDING: 'bg-gray-400',
  PAUSED: 'bg-gray-300',
  MAINTENANCE: 'bg-amber-500',
};

export default function StatusPage() {
  const [data, setData] = useState<PublicStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  /** 缺金鑰 / 金鑰錯誤 —— 顯示「需要存取金鑰」面板而非一般錯誤 */
  const [needsKey, setNeedsKey] = useState(false);

  const load = useCallback(async () => {
    // 此頁採 token-gated:網址要帶 ?key=<STATUS_PAGE_KEY>
    const key = new URLSearchParams(window.location.search).get('key') ?? '';
    if (!key) {
      setNeedsKey(true);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/v1/public/status?key=${encodeURIComponent(key)}`, {
        cache: 'no-store',
      });
      if (res.status === 401 || res.status === 403) {
        setNeedsKey(true);
        return;
      }
      const json = await res.json();
      if (json?.success && json.data) {
        setData(json.data as PublicStatus);
        setError(false);
        setNeedsKey(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* 標頭 */}
        <header className="mb-6 flex items-center gap-2">
          <PiPulseDuotone className="h-7 w-7 text-blue-600" />
          <h1 className="text-xl font-bold text-slate-900">服務狀態</h1>
          <div className="flex-1" />
          {data && (
            <span className="text-xs text-slate-400">
              更新於 {new Date(data.generatedAt).toLocaleString('zh-TW')}
            </span>
          )}
        </header>

        {loading && !data && !needsKey && (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
            <p className="mt-3 text-sm text-slate-500">載入中...</p>
          </div>
        )}

        {needsKey && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
            <p className="text-base font-semibold text-amber-800">此頁需要存取金鑰</p>
            <p className="mt-2 text-sm text-amber-700">
              請使用對方提供、含 <code className="rounded bg-amber-100 px-1.5 py-0.5">?key=...</code> 的完整連結開啟此頁。
            </p>
          </div>
        )}

        {error && !data && !needsKey && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
            目前無法取得服務狀態,請稍後再試。
          </div>
        )}

        {data && (
          <>
            {/* 整體狀態 banner */}
            <div
              className={`mb-8 flex items-center gap-3 rounded-xl border px-5 py-4 ${OVERALL[data.overall].cls}`}
            >
              <span className={`h-3 w-3 rounded-full ${OVERALL[data.overall].dot}`} />
              <span className="text-base font-semibold">{OVERALL[data.overall].label}</span>
            </div>

            {/* 分組服務 */}
            {data.groups.length === 0 ? (
              <p className="text-center text-sm text-slate-400">目前沒有對外監控的服務。</p>
            ) : (
              <div className="space-y-8">
                {data.groups.map((group) => (
                  <section key={group.name}>
                    <h2 className="mb-3 text-sm font-semibold text-slate-600">{group.name}</h2>
                    <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {group.services.map((svc) => (
                        <ServiceRow key={svc.name} service={svc} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}

        <footer className="mt-12 text-center text-xs text-slate-400">
          此頁每 60 秒自動更新 · Powered by Azeroth Monitor
        </footer>
      </div>
    </main>
  );
}

function ServiceRow({ service }: { service: PublicService }) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 items-center gap-2 sm:w-52 sm:shrink-0">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATE_DOT[service.state] ?? 'bg-gray-300'}`} />
        <span className="truncate text-sm font-medium text-slate-900" title={service.name}>
          {service.name}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <HeartbeatBar checks={service.heartbeats} size="sm" />
      </div>

      <div className="flex shrink-0 items-center gap-4 text-right">
        <Metric label="24h" value={formatPct(service.uptime24h)} />
        <Metric label="7d" value={formatPct(service.uptime7d)} />
        <span className="w-14 text-xs font-medium text-slate-500">
          {STATE_LABEL[service.state] ?? service.state}
        </span>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-14">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="font-mono text-xs text-slate-700">{value}</div>
    </div>
  );
}

function formatPct(v: number | null): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}
