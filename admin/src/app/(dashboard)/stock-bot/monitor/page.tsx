'use client';

import { useCallback, useEffect, useState } from 'react';

import { Modal } from '@/components/modal';

interface ApiResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}
interface QueueCount {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}
interface Heartbeat {
  online: boolean;
  lastBeatAt: number | null;
  ageMs: number | null;
}
interface JobRow {
  id: string;
  type: string;
  symbol: string | null;
  status: string;
  summary: string;
  error: string | null;
  input?: unknown;
  output?: unknown;
  jobId?: string | null;
  createdAt: string;
  updatedAt: string;
}
interface ScheduleInfo {
  key: string;
  label: string;
  pattern: string;
  hour: number;
  minute: number;
  /** 執行星期（cron DOW，0=週日…6=週六）；滿 7 天表每天。 */
  weekdays: number[];
  enabled: boolean;
  next: number | null;
  tz: string;
}
interface ScheduleRunRow {
  id: string;
  key: string;
  trigger: string;
  status: string;
  result: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

async function apiGet<T>(url: string): Promise<ApiResult<T>> {
  const res = await fetch(url);
  return (await res.json()) as ApiResult<T>;
}

const STATUS_COLOR: Record<string, string> = {
  DONE: 'text-green-600',
  RUNNING: 'text-blue-600',
  PENDING: 'text-gray-500',
  FAILED: 'text-red-600',
};

/** Job 詳情 Modal 的 JSON / 錯誤區塊共用樣式（邊框與背景顏色由各區塊另補）。 */
const LOG_PRE_CLASS =
  'max-h-64 overflow-auto rounded-lg border p-3 font-mono text-xs leading-relaxed';

/** 觸發來源中文標籤。 */
const TRIGGER_LABEL: Record<string, string> = {
  schedule: '排程',
  manual: '手動',
  command: '指令',
};
/** 觸發來源 badge 樣式。 */
const TRIGGER_BADGE: Record<string, string> = {
  schedule: 'bg-gray-100 text-gray-600',
  manual: 'bg-amber-100 text-amber-700',
  command: 'bg-purple-100 text-purple-700',
};

/** 星期 chips（顯示順序 一~日；值為 cron DOW，0=週日）。 */
const WEEKDAY_CHIPS: { dow: number; label: string }[] = [
  { dow: 1, label: '一' },
  { dow: 2, label: '二' },
  { dow: 3, label: '三' },
  { dow: 4, label: '四' },
  { dow: 5, label: '五' },
  { dow: 6, label: '六' },
  { dow: 0, label: '日' },
];
const WEEKDAYS_ALL = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS_WORKDAY = [1, 2, 3, 4, 5];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 星期 + 時間 → 中文描述（零依賴）。 */
function describeSchedule(weekdays: number[], hour: number, minute: number): string {
  const time = `${pad2(hour)}:${pad2(minute)}`;
  const set = new Set(weekdays);
  if (set.size === 0) {
    return '未選擇星期';
  }
  if (set.size === 7) {
    return `每天 ${time}`;
  }
  if (set.size === 5 && WEEKDAYS_WORKDAY.every((d) => set.has(d))) {
    return `每個工作日（一~五）${time}`;
  }
  if (set.size === 2 && set.has(0) && set.has(6)) {
    return `每個週末（六、日）${time}`;
  }
  const names = WEEKDAY_CHIPS.filter((c) => set.has(c.dow)).map((c) => `週${c.label}`);
  return `${names.join('、')} ${time}`;
}

/** 星期陣列正規化比較鍵。 */
const weekdaysKey = (w: number[]) => [...w].sort((a, b) => a - b).join(',');

export default function StockBotMonitorPage() {
  const [heartbeat, setHeartbeat] = useState<Heartbeat | null>(null);
  const [queues, setQueues] = useState<QueueCount[]>([]);
  const [schedules, setSchedules] = useState<ScheduleInfo[]>([]);
  const [edits, setEdits] = useState<
    Record<string, { time?: string; enabled?: boolean; weekdays?: number[] }>
  >({});
  const [scheduleMsg, setScheduleMsg] = useState('');
  const [triggerMsg, setTriggerMsg] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [runsByKey, setRunsByKey] = useState<Record<string, ScheduleRunRow[]>>({});
  const [runsLoading, setRunsLoading] = useState(false);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [queueErr, setQueueErr] = useState('');
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobRow | null>(null);

  const refresh = useCallback(async () => {
    const q = await apiGet<{
      queues: QueueCount[];
      heartbeat: Heartbeat;
      schedules: ScheduleInfo[];
    }>('/api/v1/stock/queues');
    if (q.success && q.data) {
      setQueues(q.data.queues);
      setHeartbeat(q.data.heartbeat);
      setSchedules(q.data.schedules ?? []);
      setQueueErr('');
    } else {
      setQueueErr(q.message);
    }
    const typeParam = selectedQueue ? `&type=${selectedQueue}` : '';
    const j = await apiGet<{ jobs: JobRow[]; stats: Record<string, number> }>(
      `/api/v1/stock/jobs?limit=50${typeParam}`,
    );
    if (j.success && j.data) {
      setJobs(j.data.jobs);
      setStats(j.data.stats);
    }
  }, [selectedQueue]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const retry = async (id: string) => {
    await fetch('/api/v1/stock/jobs/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    void refresh();
  };

  const ageText = (ms: number | null) =>
    ms == null
      ? '—'
      : ms < 60_000
        ? `${Math.round(ms / 1000)} 秒前`
        : `${Math.round(ms / 60_000)} 分前`;

  const nextRunText = (next: number | null) => {
    if (next == null) {
      return '未排程';
    }
    const diffMs = next - Date.now();
    const rel =
      diffMs <= 0
        ? '即將執行'
        : diffMs < 3_600_000
          ? `約 ${Math.round(diffMs / 60_000)} 分後`
          : `約 ${Math.round(diffMs / 3_600_000)} 小時後`;
    return `${new Date(next).toLocaleString('zh-TW')}（${rel}）`;
  };

  const timeOf = (s: ScheduleInfo) => edits[s.key]?.time ?? `${pad2(s.hour)}:${pad2(s.minute)}`;
  const enabledOf = (s: ScheduleInfo) => edits[s.key]?.enabled ?? s.enabled;
  const weekdaysOf = (s: ScheduleInfo) => edits[s.key]?.weekdays ?? s.weekdays;
  const setWeekdays = (s: ScheduleInfo, weekdays: number[]) =>
    setEdits((prev) => ({ ...prev, [s.key]: { ...prev[s.key], weekdays } }));
  const toggleWeekday = (s: ScheduleInfo, dow: number) =>
    setEdits((prev) => {
      const current = prev[s.key]?.weekdays ?? s.weekdays;
      const set = new Set(current);
      if (set.has(dow)) {
        set.delete(dow);
      } else {
        set.add(dow);
      }
      return {
        ...prev,
        [s.key]: { ...prev[s.key], weekdays: Array.from(set).sort((a, b) => a - b) },
      };
    });
  const previewOf = (s: ScheduleInfo) => {
    const [hh, mm] = timeOf(s).split(':').map(Number);
    return describeSchedule(weekdaysOf(s), hh, mm);
  };
  const isDirty = (s: ScheduleInfo) =>
    edits[s.key] != null &&
    (timeOf(s) !== `${pad2(s.hour)}:${pad2(s.minute)}` ||
      enabledOf(s) !== s.enabled ||
      weekdaysKey(weekdaysOf(s)) !== weekdaysKey(s.weekdays));

  const saveSchedule = async (s: ScheduleInfo) => {
    const weekdays = weekdaysOf(s);
    if (weekdays.length === 0) {
      setScheduleMsg('請至少選擇一個星期');
      return;
    }
    const [hh, mm] = timeOf(s).split(':').map(Number);
    setScheduleMsg(`儲存「${s.label}」中…`);
    const res = await fetch('/api/v1/stock/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: s.key, hour: hh, minute: mm, weekdays, enabled: enabledOf(s) }),
    });
    const json = (await res.json()) as ApiResult;
    if (!json.success) {
      setScheduleMsg(json.message || '排程更新失敗');
      return;
    }
    setScheduleMsg(`已更新「${s.label}」`);
    setEdits((e) => {
      const next = { ...e };
      delete next[s.key];
      return next;
    });
    void refresh();
  };

  const loadRuns = useCallback(async (key: string) => {
    setRunsLoading(true);
    const r = await apiGet<{ runs: ScheduleRunRow[] }>(
      `/api/v1/stock/schedules/runs?key=${encodeURIComponent(key)}&limit=20`,
    );
    if (r.success && r.data) {
      const runs = r.data.runs;
      setRunsByKey((prev) => ({ ...prev, [key]: runs }));
    }
    setRunsLoading(false);
  }, []);

  const toggleRuns = (s: ScheduleInfo) => {
    if (expandedKey === s.key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(s.key);
    void loadRuns(s.key);
  };

  const runNow = async (s: ScheduleInfo) => {
    if (!window.confirm(`確定立即執行「${s.label}」？`)) {
      return;
    }
    setTriggerMsg(`觸發「${s.label}」中…`);
    const res = await fetch('/api/v1/stock/schedules/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: s.key }),
    });
    const json = (await res.json()) as ApiResult;
    if (!json.success) {
      setTriggerMsg(json.message || '立即執行失敗');
      return;
    }
    setTriggerMsg(`已觸發「${s.label}」，稍後可在「查看紀錄」看到結果`);
    void refresh();
    if (expandedKey === s.key) {
      void loadRuns(s.key);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">機器人監控</h1>
        <span className="text-xs text-gray-400">每 5 秒自動更新</span>
      </header>

      {/* Worker 狀態 */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">Worker 狀態</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-block h-3 w-3 rounded-full ${heartbeat?.online ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span className="font-medium">{heartbeat?.online ? '在線' : '離線'}</span>
          <span className="text-sm text-gray-500">
            最後心跳：{ageText(heartbeat?.ageMs ?? null)}
          </span>
          {!heartbeat?.online && (
            <span className="text-sm text-red-500">
              （本機 worker 未啟動？請執行 `npm run dev:worker`）
            </span>
          )}
        </div>
      </section>

      {/* 排程任務（可編輯時間 / 星期） */}
      <section className="rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="font-semibold">排程任務（可編輯時間 / 星期）</h2>
          <span className="text-xs text-gray-400">可自訂星期・Asia/Taipei（台北時間）</span>
          {scheduleMsg && <span className="text-xs text-blue-600">{scheduleMsg}</span>}
          {triggerMsg && <span className="text-xs text-green-700">{triggerMsg}</span>}
        </div>
        <div className="space-y-2">
          {schedules.map((s) => (
            <div key={s.key} className="rounded border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-44 font-medium">{s.label}</span>
                <label className="flex items-center gap-1">
                  <span className="text-gray-500">時間</span>
                  <input
                    type="time"
                    className="rounded border px-2 py-1"
                    value={timeOf(s)}
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [s.key]: { ...prev[s.key], time: e.target.value },
                      }))
                    }
                  />
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    onClick={() => setWeekdays(s, WEEKDAYS_ALL)}
                  >
                    每天
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    onClick={() => setWeekdays(s, WEEKDAYS_WORKDAY)}
                  >
                    平日
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  {WEEKDAY_CHIPS.map((c) => {
                    const active = weekdaysOf(s).includes(c.dow);
                    return (
                      <button
                        key={c.dow}
                        type="button"
                        title={`週${c.label}`}
                        className={`h-7 w-7 rounded text-xs ${
                          active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                        }`}
                        onClick={() => toggleWeekday(s, c.dow)}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={enabledOf(s)}
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [s.key]: { ...prev[s.key], enabled: e.target.checked },
                      }))
                    }
                  />
                  <span className="text-gray-500">啟用</span>
                </label>
                <button
                  type="button"
                  className="rounded bg-blue-600 px-3 py-1 text-white disabled:bg-gray-300"
                  disabled={!isDirty(s)}
                  onClick={() => saveSchedule(s)}
                >
                  儲存
                </button>
                <button
                  type="button"
                  className="rounded border border-green-600 px-3 py-1 text-green-700 hover:bg-green-50"
                  onClick={() => runNow(s)}
                >
                  立即執行
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-1 text-gray-600 hover:bg-gray-50"
                  onClick={() => toggleRuns(s)}
                >
                  {expandedKey === s.key ? '收合紀錄' : '查看紀錄'}
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>排程：{previewOf(s)}</span>
                <span className="ml-auto">
                  下次：{enabledOf(s) ? nextRunText(s.next) : '已停用'}
                </span>
              </div>
              {expandedKey === s.key && (
                <div className="mt-2 border-t pt-2">
                  {(runsByKey[s.key] ?? []).length === 0 && (
                    <p className="text-xs text-gray-400">
                      {runsLoading ? '載入中…' : '尚無執行紀錄'}
                    </p>
                  )}
                  {(runsByKey[s.key] ?? []).length > 0 && (
                    <ul className="space-y-1">
                      {(runsByKey[s.key] ?? []).map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-gray-500">
                            {new Date(r.startedAt).toLocaleString('zh-TW')}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 ${
                              TRIGGER_BADGE[r.trigger] ?? 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {TRIGGER_LABEL[r.trigger] ?? r.trigger}
                          </span>
                          <span className={STATUS_COLOR[r.status] ?? ''}>{r.status}</span>
                          {r.result && <span className="text-gray-600">{r.result}</span>}
                          {r.error && <span className="text-red-500">{r.error}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
          {schedules.length === 0 && (
            <p className="text-sm text-gray-400">尚無排程（worker 未啟動或排程未註冊）</p>
          )}
        </div>
      </section>

      {/* 佇列 */}
      <section className="rounded-lg border p-4">
        <h2 className="mb-3 font-semibold">佇列狀態</h2>
        {queueErr && <p className="mb-2 text-sm text-red-500">{queueErr}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {queues.map((q) => {
            const selected = selectedQueue === q.name;
            return (
              <button
                type="button"
                key={q.name}
                onClick={() => setSelectedQueue((cur) => (cur === q.name ? null : q.name))}
                className={`rounded border p-3 text-left text-sm hover:border-blue-400 ${
                  selected ? 'border-blue-500 ring-2 ring-blue-500' : ''
                }`}
              >
                <div className="mb-1 font-medium">{q.name}</div>
                <div className="text-gray-600">等待 {q.waiting}</div>
                <div className="text-blue-600">執行中 {q.active}</div>
                <div className="text-green-600">完成 {q.completed}</div>
                <div className={q.failed > 0 ? 'text-red-600' : 'text-gray-400'}>
                  失敗 {q.failed}
                </div>
              </button>
            );
          })}
          {queues.length === 0 && !queueErr && <p className="text-gray-400">載入中…</p>}
        </div>
      </section>

      {/* Job 歷史 */}
      <section className="rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="font-semibold">近期 Job</h2>
          <span className="text-xs text-gray-500">
            DONE {stats.DONE ?? 0}・RUNNING {stats.RUNNING ?? 0}・FAILED {stats.FAILED ?? 0}
          </span>
          {selectedQueue && (
            <span className="flex items-center gap-1 text-xs text-blue-600">
              篩選中：{selectedQueue}
              <button
                type="button"
                aria-label="清除佇列篩選"
                className="rounded px-1 hover:bg-blue-50"
                onClick={() => setSelectedQueue(null)}
              >
                ✕
              </button>
            </span>
          )}
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 [&>th]:px-2 [&>th]:py-1">
                <th className="py-1">時間</th>
                <th>類型</th>
                <th>代號</th>
                <th>狀態</th>
                <th>結果</th>
                <th>錯誤</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr
                  key={j.id}
                  className="cursor-pointer border-t align-top hover:bg-gray-50 [&>td]:px-2 [&>td]:py-1"
                  onClick={() => setSelectedJob(j)}
                >
                  <td className="py-1 text-gray-500">
                    {new Date(j.createdAt).toLocaleString('zh-TW')}
                  </td>
                  <td>{j.type}</td>
                  <td>{j.symbol ?? '—'}</td>
                  <td className={STATUS_COLOR[j.status] ?? ''}>{j.status}</td>
                  <td className="max-w-xs truncate text-gray-600" title={j.summary ?? ''}>
                    {j.summary || '—'}
                  </td>
                  <td className="max-w-xs truncate text-red-500" title={j.error ?? ''}>
                    {j.error ?? ''}
                  </td>
                  <td>
                    {j.status === 'FAILED' && (
                      <button
                        className="text-blue-600 hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          void retry(j.id);
                        }}
                      >
                        重跑
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-2 text-gray-400">
                    尚無 job 紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal isOpen={!!selectedJob} onClose={() => setSelectedJob(null)} size="lg">
        {selectedJob && (
          <div className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Job 詳情</h2>
              <span className={`text-sm font-medium ${STATUS_COLOR[selectedJob.status] ?? ''}`}>
                {selectedJob.status}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-gray-500">類型</dt>
                <dd>{selectedJob.type}</dd>
              </div>
              <div>
                <dt className="text-gray-500">代號</dt>
                <dd>{selectedJob.symbol ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">建立時間</dt>
                <dd>{new Date(selectedJob.createdAt).toLocaleString('zh-TW')}</dd>
              </div>
              <div>
                <dt className="text-gray-500">更新時間</dt>
                <dd>{new Date(selectedJob.updatedAt).toLocaleString('zh-TW')}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-gray-500">Job ID</dt>
                <dd className="break-all">{selectedJob.id}</dd>
              </div>
            </dl>
            {selectedJob.error && (
              <div>
                <div className="mb-1 text-sm font-medium text-red-600">錯誤</div>
                <pre className={`${LOG_PRE_CLASS} border-red-200 bg-red-50 text-red-700`}>
                  {selectedJob.error}
                </pre>
              </div>
            )}
            <div>
              <div className="mb-1 text-sm font-medium text-gray-700">輸入（input）</div>
              <pre className={`${LOG_PRE_CLASS} border-gray-300 bg-gray-50 text-gray-800`}>
                {selectedJob.input != null ? JSON.stringify(selectedJob.input, null, 2) : '—'}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-sm font-medium text-gray-700">輸出（output）</div>
              <pre className={`${LOG_PRE_CLASS} border-gray-300 bg-gray-50 text-gray-800`}>
                {selectedJob.output != null ? JSON.stringify(selectedJob.output, null, 2) : '—'}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
