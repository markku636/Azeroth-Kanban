'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PiPlusBold,
  PiPulseDuotone,
  PiPlugsConnectedDuotone,
} from 'react-icons/pi';
import toast from 'react-hot-toast';

import { PERMISSIONS } from '@/config/permissions';
import { useHasPermission } from '@/hooks/use-permissions';
import { MonitorsKumaView } from '@/components/monitors/MonitorsKumaView';

interface MonitorRow {
  id: string;
  name: string;
  kind: 'HTTP' | 'TCP' | 'KEYWORD' | 'PUSH' | 'LOG';
  enabled: boolean;
  state: string;
  service: string | null;
  url: string | null;
  intervalSeconds: number;
  severity: string;
  lastCheckedAt: string | null;
  lastResult: string | null;
  lastLatencyMs: number | null;
  tags: string[];
  groupName: string | null;
  openIncidentId: string | null;
}

// 篩選下拉選單用,STATE_COLOR / SEV_COLOR 已搬到 MonitorsKumaView 內部。
const STATE_LABEL: Record<string, string> = {
  UP: 'UP',
  DOWN: 'DOWN',
  PENDING: '等待中',
  PAUSED: '停用',
  MAINTENANCE: '維護中',
};

const KIND_LABEL: Record<string, string> = {
  HTTP: 'HTTP',
  TCP: 'TCP',
  KEYWORD: '關鍵字',
  PUSH: '心跳',
  LOG: '日誌',
};

export default function MonitorsPage() {
  const router = useRouter();
  const canCreate = useHasPermission(PERMISSIONS.MONITORS_CREATE);

  const [monitors, setMonitors] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const fetchMonitors = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/monitors');
      const json = await res.json();
      if (json.success) {
        setMonitors(json.data ?? []);
      } else {
        toast.error(json.message ?? '載入監控列表失敗');
      }
    } catch {
      toast.error('載入監控列表失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMonitors();
    const timer = setInterval(fetchMonitors, 15_000);
    return () => clearInterval(timer);
  }, [fetchMonitors]);

  const filtered = useMemo(
    () =>
      monitors.filter((m) => {
        if (kindFilter && m.kind !== kindFilter) return false;
        if (stateFilter && m.state !== stateFilter) return false;
        if (search) {
          const s = search.toLowerCase();
          if (
            !m.name.toLowerCase().includes(s) &&
            !(m.service ?? '').toLowerCase().includes(s) &&
            !(m.url ?? '').toLowerCase().includes(s)
          ) {
            return false;
          }
        }
        return true;
      }),
    [monitors, kindFilter, stateFilter, search],
  );

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <PiPulseDuotone className="h-6 w-6 text-blue-600" />
            主動監控
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            設定監控目標,排程引擎自動定期檢查(HTTP / TCP / 關鍵字 / 心跳 / 日誌)、判斷嚴重度、自動建事故並通知。
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <PiPlusBold className="h-4 w-4" />
            新增監控
          </button>
        )}
      </div>

      {/* 工具列 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="搜尋名稱 / service / url..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-md border border-gray-300 bg-gray-0 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:bg-gray-100"
        />
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-gray-0 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:bg-gray-100"
        >
          <option value="">全部類型</option>
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-gray-0 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:bg-gray-100"
        >
          <option value="">全部狀態</option>
          {Object.entries(STATE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="ml-auto text-xs text-gray-400">{filtered.length} / {monitors.length} 個監控</div>
      </div>

      <MonitorsKumaView
        monitors={filtered}
        loading={loading}
        onMonitorClick={(id) => router.push(`/monitors/${id}`)}
      />


      {createOpen && (
        <CreateMonitorModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void fetchMonitors();
          }}
        />
      )}
    </div>
  );
}

// ── 新增 modal ───────────────────────────────────────────────────────────────
interface CreateProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateMonitorModal({ onClose, onCreated }: CreateProps) {
  const [form, setForm] = useState({
    name: '',
    kind: 'HTTP' as 'HTTP' | 'TCP' | 'KEYWORD' | 'PUSH' | 'LOG',
    service: '',
    url: '',
    tcpHost: '',
    tcpPort: '3000',
    pushTimeoutSeconds: '300',
    logMode: 'ERROR_RATE' as 'ERROR_RATE' | 'ERROR_COUNT' | 'LATENCY_P99' | 'KEYWORD',
    logWindowMinutes: '5',
    errorRateThreshold: '10',
    errorCountThreshold: '10',
    latencyP99Threshold: '5000',
    logKeyword: '',
    bodyKeywordInclude: '',
    intervalSeconds: '60',
    severity: 'SEV3' as 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4',
    failureThreshold: '2',
    autoTriage: false,
    tags: '',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** 把 form state 組成送給 API 的 payload(create + test draft 共用)。 */
  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      kind: form.kind,
      intervalSeconds: Number(form.intervalSeconds),
      severity: form.severity,
      failureThreshold: Number(form.failureThreshold),
      autoTriage: form.autoTriage,
      tags: form.tags
        .split(/[,;\s]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    };
    if (form.service.trim()) payload.service = form.service.trim();
    if (form.kind === 'HTTP' || form.kind === 'KEYWORD') {
      payload.url = form.url.trim();
      if (form.bodyKeywordInclude.trim()) payload.bodyKeywordInclude = form.bodyKeywordInclude.trim();
    }
    if (form.kind === 'TCP') {
      payload.tcpHost = form.tcpHost.trim();
      payload.tcpPort = Number(form.tcpPort);
    }
    if (form.kind === 'PUSH') {
      payload.pushTimeoutSeconds = Number(form.pushTimeoutSeconds);
    }
    if (form.kind === 'LOG') {
      payload.logMode = form.logMode;
      payload.logWindowMinutes = Number(form.logWindowMinutes);
      if (form.logMode === 'ERROR_RATE') payload.errorRateThreshold = Number(form.errorRateThreshold);
      if (form.logMode === 'ERROR_COUNT') payload.errorCountThreshold = Number(form.errorCountThreshold);
      if (form.logMode === 'LATENCY_P99') payload.latencyP99Threshold = Number(form.latencyP99Threshold);
      if (form.logMode === 'KEYWORD') payload.logKeyword = form.logKeyword.trim();
    }
    return payload;
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/v1/monitors/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.message ?? '測試失敗');
        return;
      }
      const r = json.data as { result: string; detail?: string | null; latencyMs?: number | null };
      const tag = r.result === 'OK' ? '✓' : r.result === 'FAIL' ? '✗' : '○';
      const latency = r.latencyMs != null ? ` (${r.latencyMs}ms)` : '';
      const detail = r.detail ? ` — ${r.detail}` : '';
      if (r.result === 'OK') {
        toast.success(`${tag} ${r.result}${latency}`);
      } else {
        toast.error(`${tag} ${r.result}${latency}${detail}`);
      }
    } catch {
      toast.error('測試失敗');
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('名稱必填');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/v1/monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('監控已建立');
        onCreated();
      } else {
        toast.error(json.message ?? '建立失敗');
      }
    } catch {
      toast.error('建立失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl dark:bg-gray-100">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900">
            <PiPlugsConnectedDuotone className="h-5 w-5 text-blue-600" />
            新增監控
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900">
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* 基本 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="名稱 *">
              <input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                className={inputCls}
                placeholder="例如:checkout-api HTTP"
              />
            </Field>
            <Field label="類型 *">
              <select value={form.kind} onChange={(e) => update('kind', e.target.value as typeof form.kind)} className={inputCls}>
                <option value="HTTP">HTTP 健康探測</option>
                <option value="TCP">TCP 連線</option>
                <option value="KEYWORD">HTTP + 內容關鍵字</option>
                <option value="PUSH">PUSH 心跳</option>
                <option value="LOG">日誌異常掃描</option>
              </select>
            </Field>
            <Field label="服務 (Incident.service / ES service.keyword)" full>
              <input
                value={form.service}
                onChange={(e) => update('service', e.target.value)}
                className={inputCls}
                placeholder="例如:checkout-api"
              />
            </Field>
          </div>

          {/* HTTP / KEYWORD */}
          {(form.kind === 'HTTP' || form.kind === 'KEYWORD') && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-blue-100 bg-blue-50/50 p-3 dark:bg-blue-900/10">
              <Field label="URL *" full>
                <input
                  value={form.url}
                  onChange={(e) => update('url', e.target.value)}
                  className={inputCls}
                  placeholder="http://sim-checkout:3000/api/health"
                />
              </Field>
              {form.kind === 'KEYWORD' && (
                <Field label="body 必含關鍵字" full>
                  <input
                    value={form.bodyKeywordInclude}
                    onChange={(e) => update('bodyKeywordInclude', e.target.value)}
                    className={inputCls}
                    placeholder="例如:ok"
                  />
                </Field>
              )}
            </div>
          )}

          {/* TCP */}
          {form.kind === 'TCP' && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-blue-100 bg-blue-50/50 p-3 dark:bg-blue-900/10">
              <Field label="主機名 *">
                <input value={form.tcpHost} onChange={(e) => update('tcpHost', e.target.value)} className={inputCls} placeholder="sim-checkout" />
              </Field>
              <Field label="Port *">
                <input value={form.tcpPort} onChange={(e) => update('tcpPort', e.target.value)} className={inputCls} type="number" />
              </Field>
            </div>
          )}

          {/* PUSH */}
          {form.kind === 'PUSH' && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-blue-100 bg-blue-50/50 p-3 dark:bg-blue-900/10">
              <Field label="逾時秒數 (>= 60)" full>
                <input value={form.pushTimeoutSeconds} onChange={(e) => update('pushTimeoutSeconds', e.target.value)} className={inputCls} type="number" />
              </Field>
              <p className="col-span-2 text-xs text-gray-500">
                建立後系統會產生 push token,你的外部服務透過 POST /api/v1/monitors/[id]/push 帶 `x-monitor-push-token` 標頭來打卡。
              </p>
            </div>
          )}

          {/* LOG */}
          {form.kind === 'LOG' && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-blue-100 bg-blue-50/50 p-3 dark:bg-blue-900/10">
              <Field label="LOG 模式 *">
                <select value={form.logMode} onChange={(e) => update('logMode', e.target.value as typeof form.logMode)} className={inputCls}>
                  <option value="ERROR_RATE">錯誤率</option>
                  <option value="ERROR_COUNT">錯誤計數</option>
                  <option value="LATENCY_P99">P99 延遲</option>
                  <option value="KEYWORD">日誌關鍵字</option>
                </select>
              </Field>
              <Field label="時間窗 (分鐘)">
                <input value={form.logWindowMinutes} onChange={(e) => update('logWindowMinutes', e.target.value)} className={inputCls} type="number" />
              </Field>
              {form.logMode === 'ERROR_RATE' && (
                <Field label="錯誤率門檻 (%)" full>
                  <input value={form.errorRateThreshold} onChange={(e) => update('errorRateThreshold', e.target.value)} className={inputCls} type="number" step="0.1" />
                </Field>
              )}
              {form.logMode === 'ERROR_COUNT' && (
                <Field label="錯誤次數門檻" full>
                  <input value={form.errorCountThreshold} onChange={(e) => update('errorCountThreshold', e.target.value)} className={inputCls} type="number" />
                </Field>
              )}
              {form.logMode === 'LATENCY_P99' && (
                <Field label="P99 延遲門檻 (ms)" full>
                  <input value={form.latencyP99Threshold} onChange={(e) => update('latencyP99Threshold', e.target.value)} className={inputCls} type="number" />
                </Field>
              )}
              {form.logMode === 'KEYWORD' && (
                <Field label="日誌關鍵字" full>
                  <input value={form.logKeyword} onChange={(e) => update('logKeyword', e.target.value)} className={inputCls} placeholder="例如:OutOfMemoryError" />
                </Field>
              )}
            </div>
          )}

          {/* 通用 */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="檢查間隔 (秒,>=15)">
              <input value={form.intervalSeconds} onChange={(e) => update('intervalSeconds', e.target.value)} className={inputCls} type="number" />
            </Field>
            <Field label="嚴重度">
              <select value={form.severity} onChange={(e) => update('severity', e.target.value as typeof form.severity)} className={inputCls}>
                <option value="SEV1">SEV1</option>
                <option value="SEV2">SEV2</option>
                <option value="SEV3">SEV3</option>
                <option value="SEV4">SEV4</option>
              </select>
            </Field>
            <Field label="連續失敗門檻 (達此次數才開事故)">
              <input value={form.failureThreshold} onChange={(e) => update('failureThreshold', e.target.value)} className={inputCls} type="number" />
            </Field>
            <Field label="自動 Selkie 調查">
              <label className="flex items-center gap-2 py-2 text-sm">
                <input type="checkbox" checked={form.autoTriage} onChange={(e) => update('autoTriage', e.target.checked)} />
                <span className="text-gray-700">開事故時自動觸發 Selkie triage</span>
              </label>
            </Field>
            <Field label="標籤 (逗號或空白分隔)" full>
              <input value={form.tags} onChange={(e) => update('tags', e.target.value)} className={inputCls} placeholder="例如:http, checkout" />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-5 py-3">
          <button
            onClick={() => void handleTest()}
            disabled={testing || saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            title="不存 DB,直接跑一次看看結果"
          >
            {testing ? '測試中...' : '測試一次'}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              取消
            </button>
            <button onClick={() => void handleSubmit()} disabled={saving} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? '建立中...' : '建立'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-md border border-gray-300 bg-gray-0 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none dark:bg-gray-100';

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
