'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  PiArrowLeftBold,
  PiPlayBold,
  PiPauseBold,
  PiTrashBold,
  PiPulseDuotone,
  PiWarningOctagonDuotone,
  PiLightningBold,
} from 'react-icons/pi';
import toast from 'react-hot-toast';

import { PERMISSIONS } from '@/config/permissions';
import StatusBadge, { type StatusType } from '@/components/status-badge';
import { useHasPermission } from '@/hooks/use-permissions';
import { HeartbeatBar } from '@/components/monitors/HeartbeatBar';
import { PingChart } from '@/components/monitors/PingChart';

interface MonitorCheck {
  id: string;
  result: 'OK' | 'FAIL' | 'SKIPPED' | 'MAINTENANCE';
  magnitude: number | null;
  latencyMs: number | null;
  detail: string | null;
  checkedAt: string;
}

interface MonitorDetail {
  id: string;
  name: string;
  kind: 'HTTP' | 'TCP' | 'KEYWORD' | 'PUSH' | 'LOG';
  enabled: boolean;
  state: string;
  service: string | null;
  url: string | null;
  httpMethod: string | null;
  bodyKeywordInclude: string | null;
  bodyKeywordExclude: string | null;
  tcpHost: string | null;
  tcpPort: number | null;
  pushToken: string | null;
  pushTimeoutSeconds: number;
  lastPushAt: string | null;
  logMode: string | null;
  logWindowMinutes: number;
  errorRateThreshold: number | null;
  errorCountThreshold: number | null;
  latencyP99Threshold: number | null;
  logKeyword: string | null;
  intervalSeconds: number;
  severity: string;
  severityRamp: unknown;
  autoTriage: boolean;
  failureThreshold: number;
  reAlertMinutes: number;
  timeoutMs: number;
  maintenanceUntil: string | null;
  tags: string[];
  groupName: string | null;
  dependsOn: { id: string; name: string; state: string } | null;
  channels: Array<{ id: string; name: string; kind: string }>;
  consecutiveFailures: number;
  lastCheckedAt: string | null;
  lastResult: string | null;
  lastLatencyMs: number | null;
  lastMagnitude: number | null;
  openIncidentId: string | null;
  recentChecks: MonitorCheck[];
}

/** /api/v1/monitors/[id]/stats 的回傳:後端算好的 24h/7d/30d uptime 與 avg/p95 latency。 */
interface MonitorStats {
  uptime: { '24h': number | null; '7d': number | null; '30d': number | null };
  latency: { avgMs: number | null; p95Ms: number | null };
  recentChecks: Array<{
    id: string;
    result: string;
    magnitude: number | null;
    latencyMs: number | null;
    detail: string | null;
    checkedAt: string;
  }>;
  totalChecks: number;
}

const STATE_COLOR: Record<string, StatusType> = {
  UP: 'success',
  DOWN: 'error',
  PENDING: 'pending',
  PAUSED: 'free',
  MAINTENANCE: 'info',
};
const STATE_LABEL: Record<string, string> = {
  UP: 'UP', DOWN: 'DOWN', PENDING: '等待中', PAUSED: '停用', MAINTENANCE: '維護中',
};
const SEV_COLOR: Record<string, StatusType> = {
  SEV1: 'error', SEV2: 'warning', SEV3: 'info', SEV4: 'free',
};

export default function MonitorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const canEdit = useHasPermission(PERMISSIONS.MONITORS_EDIT);
  const canDelete = useHasPermission(PERMISSIONS.MONITORS_DELETE);

  const [monitor, setMonitor] = useState<MonitorDetail | null>(null);
  const [stats, setStats] = useState<MonitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetchMonitor = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/monitors/${id}`);
      const json = await res.json();
      if (json.success) {
        setMonitor(json.data);
      } else {
        toast.error(json.message ?? '載入失敗');
      }
    } catch {
      toast.error('載入失敗');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/monitors/${id}/stats`);
      const json = await res.json();
      if (json.success) setStats(json.data as MonitorStats);
    } catch {
      // 靜默失敗 —— heartbeat 區會 fallback 到 monitor.recentChecks
    }
  }, [id]);

  useEffect(() => {
    void fetchMonitor();
    void fetchStats();
    const timer = setInterval(() => {
      void fetchMonitor();
      void fetchStats();
    }, 15_000);
    return () => clearInterval(timer);
  }, [fetchMonitor, fetchStats]);

  const toggleEnabled = async () => {
    if (!monitor) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/monitors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !monitor.enabled }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(monitor.enabled ? '已停用' : '已啟用');
        void fetchMonitor();
      } else {
        toast.error(json.message ?? '操作失敗');
      }
    } catch {
      toast.error('操作失敗');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定刪除這個監控?其檢查歷史也會一併移除。')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/monitors/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success('已刪除');
        router.push('/monitors');
      } else {
        toast.error(json.message ?? '刪除失敗');
        setBusy(false);
      }
    } catch {
      toast.error('刪除失敗');
      setBusy(false);
    }
  };

  const handleRunNow = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/monitors/${id}/check`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        const r = json.data as { result: string; detail?: string | null; latencyMs?: number | null };
        const tag = r.result === 'OK' ? '✓' : r.result === 'FAIL' ? '✗' : '○';
        const detail = r.detail ? ` — ${r.detail}` : '';
        const latency = r.latencyMs != null ? ` (${r.latencyMs}ms)` : '';
        if (r.result === 'OK') {
          toast.success(`${tag} ${r.result}${latency}`);
        } else {
          toast.error(`${tag} ${r.result}${latency}${detail}`);
        }
        void fetchMonitor();
      } else {
        toast.error(json.message ?? '執行失敗');
      }
    } catch {
      toast.error('執行失敗');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-gray-200 bg-gray-0 p-8 text-center shadow dark:bg-gray-100">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
        </div>
      </div>
    );
  }

  if (!monitor) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">找不到此監控。</p>
        <button onClick={() => router.push('/monitors')} className="mt-3 text-sm text-blue-600 hover:underline">
          ← 回監控列表
        </button>
      </div>
    );
  }

  // stats 來自後端 /api/v1/monitors/[id]/stats,沒抓到就 fallback 用 monitor.recentChecks
  const heartbeatChecks = stats?.recentChecks ?? monitor.recentChecks.map((c) => ({
    id: c.id,
    result: c.result,
    latencyMs: c.latencyMs,
    detail: c.detail,
    checkedAt: c.checkedAt,
  }));

  return (
    <div className="p-6">
      <div className="max-w-5xl">
        <button
          onClick={() => router.push('/monitors')}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <PiArrowLeftBold className="h-3.5 w-3.5" />
          回監控列表
        </button>

        {/* 標頭 */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <PiPulseDuotone className="h-6 w-6 text-blue-600" />
              <StatusBadge
                status={STATE_COLOR[monitor.state] ?? 'info'}
                label={STATE_LABEL[monitor.state] ?? monitor.state}
                size="sm"
              />
              <StatusBadge status={SEV_COLOR[monitor.severity] ?? 'info'} label={monitor.severity} size="sm" />
              <span className="text-xs text-gray-400">{monitor.kind}</span>
              {!monitor.enabled && <span className="text-xs text-gray-400">(已停用)</span>}
            </div>
            <h1 className="mt-1.5 text-xl font-bold text-gray-900">{monitor.name}</h1>
            {monitor.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {monitor.tags.map((t) => (
                  <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {canEdit && (
              <button
                onClick={() => void handleRunNow()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                title="立即執行一次檢查"
              >
                <PiLightningBold className="h-3.5 w-3.5" />
                立即執行
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => void toggleEnabled()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {monitor.enabled ? <PiPauseBold className="h-3.5 w-3.5" /> : <PiPlayBold className="h-3.5 w-3.5" />}
                {monitor.enabled ? '停用' : '啟用'}
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => void handleDelete()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <PiTrashBold className="h-3.5 w-3.5" />
                刪除
              </button>
            )}
          </div>
        </div>

        {/* 統計卡 —— 用後端 /stats 端點的 24h/7d/30d uptime + avg/p95 latency */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
          <StatCard label="24h Uptime" value={formatPct(stats?.uptime['24h'])} />
          <StatCard label="7d Uptime" value={formatPct(stats?.uptime['7d'])} />
          <StatCard label="30d Uptime" value={formatPct(stats?.uptime['30d'])} />
          <StatCard label="平均延遲" value={formatMs(stats?.latency.avgMs)} />
          <StatCard label="P95 延遲" value={formatMs(stats?.latency.p95Ms)} />
          <StatCard label="連續失敗" value={String(monitor.consecutiveFailures)} />
        </div>

        {/* Heartbeat bar + ping chart */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-0 p-4 shadow dark:bg-gray-100">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">最近 50 次檢查</h2>
            <span className="text-xs text-gray-400">
              綠 OK · 紅 FAIL · 琥珀 維護 · 灰 略過
            </span>
          </div>
          <HeartbeatBar
            checks={heartbeatChecks}
            size="lg"
            fallbackLastResult={monitor.lastResult}
          />
          <div className="mt-4">
            <PingChart checks={heartbeatChecks} size="lg" gradientId={`pingGrad-${id}`} />
          </div>
        </div>

        {/* 設定 metadata */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-0 p-5 shadow dark:bg-gray-100">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">設定</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
            <Item label="檢查間隔">{monitor.intervalSeconds}s</Item>
            <Item label="逾時">{monitor.timeoutMs}ms</Item>
            <Item label="連續失敗門檻">{monitor.failureThreshold}</Item>
            <Item label="自動 Selkie 調查">{monitor.autoTriage ? '是' : '否'}</Item>
            <Item label="再次通知 (分鐘,0=關)">{monitor.reAlertMinutes}</Item>
            <Item label="服務 (Incident.service)">
              <span className="font-mono">{monitor.service ?? '-'}</span>
            </Item>
            {(monitor.kind === 'HTTP' || monitor.kind === 'KEYWORD') && (
              <>
                <Item label="URL" full>
                  <span className="font-mono text-xs break-all">{monitor.url ?? '-'}</span>
                </Item>
                {monitor.bodyKeywordInclude && (
                  <Item label="body 必含">{monitor.bodyKeywordInclude}</Item>
                )}
                {monitor.bodyKeywordExclude && (
                  <Item label="body 不可含">{monitor.bodyKeywordExclude}</Item>
                )}
              </>
            )}
            {monitor.kind === 'TCP' && (
              <>
                <Item label="主機">{monitor.tcpHost}</Item>
                <Item label="Port">{monitor.tcpPort}</Item>
              </>
            )}
            {monitor.kind === 'PUSH' && (
              <>
                <Item label="逾時秒數">{monitor.pushTimeoutSeconds}s</Item>
                <Item label="最後 push">
                  {monitor.lastPushAt ? new Date(monitor.lastPushAt).toLocaleString('zh-TW') : '從未'}
                </Item>
                <Item label="Push token" full>
                  <code className="rounded bg-gray-100 px-2 py-0.5 text-xs">{monitor.pushToken ?? '-'}</code>
                </Item>
              </>
            )}
            {monitor.kind === 'LOG' && (
              <>
                <Item label="LOG 模式">{monitor.logMode}</Item>
                <Item label="時間窗">{monitor.logWindowMinutes}m</Item>
                {monitor.errorRateThreshold != null && (
                  <Item label="錯誤率門檻">{monitor.errorRateThreshold}%</Item>
                )}
                {monitor.errorCountThreshold != null && (
                  <Item label="錯誤次數門檻">{monitor.errorCountThreshold}</Item>
                )}
                {monitor.latencyP99Threshold != null && (
                  <Item label="P99 延遲門檻">{monitor.latencyP99Threshold}ms</Item>
                )}
                {monitor.logKeyword && <Item label="關鍵字">{monitor.logKeyword}</Item>}
              </>
            )}
            {monitor.dependsOn && (
              <Item label="相依於" full>
                <button onClick={() => router.push(`/monitors/${monitor.dependsOn!.id}`)} className="text-blue-600 hover:underline">
                  {monitor.dependsOn.name}
                </button>
                <span className="ml-2 text-xs text-gray-400">({monitor.dependsOn.state})</span>
              </Item>
            )}
            {monitor.channels.length > 0 && (
              <Item label="通知通道" full>
                <div className="flex flex-wrap gap-1">
                  {monitor.channels.map((c) => (
                    <span key={c.id} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                      {c.name} ({c.kind})
                    </span>
                  ))}
                </div>
              </Item>
            )}
          </div>
        </div>

        {/* 開著的事故 */}
        {monitor.openIncidentId && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:bg-red-900/20">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <PiWarningOctagonDuotone className="h-5 w-5 text-red-600" />
                <span className="text-sm font-medium text-red-700">此監控目前有一筆「開著」的事故</span>
              </div>
              <button
                onClick={() => router.push(`/incidents/${monitor.openIncidentId}`)}
                className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                查看事故
              </button>
            </div>
          </div>
        )}

        {/* 最近檢查表 */}
        <div className="rounded-lg border border-gray-200 bg-gray-0 shadow dark:bg-gray-100">
          <h2 className="border-b border-gray-200 px-5 py-3 text-sm font-semibold text-gray-900">最近檢查紀錄</h2>
          {monitor.recentChecks.length === 0 ? (
            <p className="p-5 text-xs text-gray-400">尚未檢查</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-200/30">
                <tr>
                  <th className="px-4 py-2 font-medium">時間</th>
                  <th className="px-4 py-2 font-medium">結果</th>
                  <th className="px-4 py-2 font-medium">量測值</th>
                  <th className="px-4 py-2 font-medium">延遲</th>
                  <th className="px-4 py-2 font-medium">詳情</th>
                </tr>
              </thead>
              <tbody>
                {monitor.recentChecks.slice(0, 20).map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-4 py-1.5 text-xs text-gray-500">
                      {new Date(c.checkedAt).toLocaleString('zh-TW')}
                    </td>
                    <td className="px-4 py-1.5">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                          c.result === 'OK'
                            ? 'bg-emerald-100 text-emerald-700'
                            : c.result === 'FAIL'
                            ? 'bg-red-100 text-red-700'
                            : c.result === 'MAINTENANCE'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {c.result}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-xs text-gray-600">{c.magnitude ?? '-'}</td>
                    <td className="px-4 py-1.5 text-xs text-gray-600">{c.latencyMs != null ? `${c.latencyMs}ms` : '-'}</td>
                    <td className="px-4 py-1.5 text-xs text-gray-500">{c.detail ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-0 p-3 shadow dark:bg-gray-100">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function Item({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'col-span-2 md:col-span-3' : ''}>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-0.5 text-gray-900">{children}</div>
    </div>
  );
}

function formatPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(2)}%`;
}

function formatMs(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${Math.round(v)} ms`;
}
