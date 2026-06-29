'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Badge, Button, Switch } from 'rizzui';
import { PiArrowLeftBold, PiArrowsClockwiseBold, PiCpuDuotone, PiHourglassMediumDuotone, PiCheckCircleDuotone, PiXBold } from 'react-icons/pi';
import { useConfirm } from '@/hooks/use-confirm';

interface QueueItem {
  jobId: string;
  projectId: string;
  projectTitle: string;
  mode: string;
  shotCount: number;
  owned: boolean;
  ts: number | null;
}
interface ActiveItem extends QueueItem {
  current?: {
    stage: string;
    pct?: number;
    status?: string;
    shotIndex?: number;
    shotTotal?: number;
    shotLabel?: string;
    ageSec: number;
  };
}
interface QueueStatus {
  active: ActiveItem[];
  waiting: QueueItem[];
  delayed: QueueItem[];
  counts: { active: number; waiting: number; delayed: number; completed: number; failed: number };
  comfy?: { running: number; pending: number };
  degraded?: boolean;
  fetchedAt: number;
}

const STAGE_LABEL: Record<string, string> = {
  plan: '規劃',
  gate: '等待確認',
  keyframe: '生成關鍵幀',
  voice: '配音',
  video: '生成影片',
  assemble: '合成',
  done: '完成',
  'keyframes-done': '關鍵幀完成',
  error: '錯誤',
};
const stageLabel = (s?: string) => (s ? STAGE_LABEL[s] ?? s : '');

// 正在跑的任務「幾秒沒更新」：秒數大時改用分鐘顯示，較易讀。
const fmtAge = (s: number) => (s < 90 ? `${s} 秒` : `${Math.floor(s / 60)} 分${s % 60 ? ` ${s % 60} 秒` : ''}`);

function ago(ms: number | null): string {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分${s % 60 ? ` ${s % 60} 秒` : ''}前`;
  const h = Math.floor(m / 60);
  return `${h} 小時 ${m % 60} 分前`;
}

export default function StudioQueuePage() {
  const [data, setData] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set()); // 正在取消中的 jobId
  const [vram, setVram] = useState<number | null>(null); // ComfyUI 可用顯存 GB（/health 已算出但別處沒用）
  const [ttsUp, setTtsUp] = useState<boolean | null>(null); // 配音服務狀態（null=未設定不顯示）
  const confirm = useConfirm();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const seq = useRef(0); // 防止較慢的舊請求覆蓋較新的（輪詢重疊時的倒退閃爍）

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await fetch('/api/v1/studio/queue', { cache: 'no-store' });
      const json = await res.json();
      if (mine !== seq.current) return; // 已有更新的請求發出 → 丟棄這次結果
      if (res.ok) {
        setData(json.data as QueueStatus);
        setErr(null);
      } else {
        setErr(json.message ?? '載入失敗');
      }
    } catch {
      if (mine === seq.current) setErr('載入失敗');
    }
    if (mine === seq.current) setLoading(false);
  }, []);

  const onCancel = useCallback(
    async (job: QueueItem, active: boolean) => {
      const ok = await confirm({
        title: active ? '取消正在跑的任務？' : '取消排隊任務？',
        message: active
          ? `「${job.projectTitle}」正在使用 GPU。取消會嘗試中斷目前算圖並把它移出佇列。`
          : `把「${job.projectTitle}」從排隊中移除，這筆就不會跑了。`,
        type: 'danger',
        confirmLabel: '取消任務',
        cancelLabel: '不要',
      });
      if (!ok) return;
      setBusy((s) => new Set(s).add(job.jobId));
      try {
        const res = await fetch('/api/v1/studio/queue/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.jobId }),
        });
        const json = await res.json();
        if (res.ok) {
          toast.success(json.message ?? '已取消');
          void load();
        } else {
          toast.error(json.message ?? '取消失敗');
        }
      } catch {
        toast.error('取消失敗');
      } finally {
        setBusy((s) => {
          const n = new Set(s);
          n.delete(job.jobId);
          return n;
        });
      }
    },
    [confirm, load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (auto) timer.current = setInterval(() => void load(), 2000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [auto, load]);

  // GPU 可用顯存：用 /health（探 ComfyUI /system_stats）較慢輪詢，避免 3s timeout 堆在 2s 主輪詢上。
  useEffect(() => {
    let stop = false;
    const probe = async () => {
      try {
        const r = await fetch('/api/v1/studio/health', { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (stop) return;
        setVram(typeof j?.data?.comfyui?.vramFreeGB === 'number' ? j.data.comfyui.vramFreeGB : null);
        const t = j?.data?.tts;
        setTtsUp(t?.configured ? Boolean(t.reachable) : null);
      } catch { /* 顯存顯示是錦上添花，失敗忽略 */ }
    };
    void probe();
    const t = setInterval(() => { if (!document.hidden) void probe(); }, 8000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  // 同時用清單與計數判定，避免兩者在 job 轉移瞬間不一致造成的閃爍
  const idle = data && data.active.length === 0 && data.counts.active === 0;

  return (
    <div className="flex h-full w-full max-w-4xl flex-col px-2 py-2 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <PiCpuDuotone className="h-7 w-7 text-blue-600" /> GPU 佇列
          </h1>
          <p className="mt-1 text-sm text-gray-500">GPU 一次只跑一鏡，這裡是它現在在做什麼、還有什麼排隊沒跑。</p>
        </div>
        <Link href="/studio">
          <Button variant="outline" size="sm">
            <PiArrowLeftBold className="me-1.5 h-4 w-4" /> 回專案
          </Button>
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <PiArrowsClockwiseBold className="me-1.5 h-4 w-4" /> 重新整理
        </Button>
        <Switch label="自動更新（每 2 秒）" checked={auto} onChange={(e) => setAuto(e.target.checked)} size="sm" />
        {data && <span className="text-xs text-gray-400">更新於 {ago(data.fetchedAt)}</span>}
      </div>

      {err && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
      {data?.degraded && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">佇列服務（Redis）暫時無法連線，顯示為閒置；稍後會自動恢復。</div>
      )}

      {loading && !data ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* ── 正在跑 ── */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-700">正在跑</h2>
            {idle ? (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                <PiCheckCircleDuotone className="h-5 w-5" /> GPU 閒置中，沒有任務在跑。
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {data?.active.map((j) => {
                  const c = j.current;
                  const pct = c?.pct != null ? Math.round(c.pct * 100) : null;
                  return (
                    <div key={j.jobId} className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 shadow-sm dark:bg-gray-50">
                      <div className="flex items-center justify-between gap-2">
                        {j.owned ? (
                          <Link href={`/studio/${j.projectId}`} className="font-semibold text-gray-900 hover:text-blue-600">
                            {j.projectTitle}
                          </Link>
                        ) : (
                          <span className="font-semibold text-gray-500">{j.projectTitle}</span>
                        )}
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge color="info" variant="flat" size="sm">{j.mode}</Badge>
                          {j.owned && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-300 text-red-600 hover:border-red-400 hover:bg-red-50"
                              isLoading={busy.has(j.jobId)}
                              onClick={() => void onCancel(j, true)}
                            >
                              <PiXBold className="me-1 h-3.5 w-3.5" /> 取消
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                          {stageLabel(c?.stage) || '處理中'}
                        </span>
                        {c?.shotIndex && c.shotTotal ? <span>第 {c.shotIndex} / 共 {c.shotTotal} 鏡</span> : null}
                        {pct != null && <span>{pct}%</span>}
                        {c && (
                          <span
                            className={c.ageSec >= 300 ? 'font-medium text-red-500' : c.ageSec >= 180 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}
                            title={c.ageSec >= 300 ? '長時間沒有進度，這個任務可能卡住了' : undefined}
                          >
                            已 {fmtAge(c.ageSec)} 未更新{c.ageSec >= 300 ? '（可能卡住）' : ''}
                          </span>
                        )}
                      </div>
                      {c?.shotLabel && <div className="mt-1 line-clamp-1 text-xs text-gray-500">「{c.shotLabel}」</div>}
                      {pct != null && (
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── 排隊中（還沒跑） ── */}
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <PiHourglassMediumDuotone className="h-4 w-4" /> 排隊中（還沒跑）
              {data && <Badge color="secondary" variant="flat" size="sm">{data.counts.waiting + data.counts.delayed}</Badge>}
            </h2>
            {data && data.counts.waiting + data.counts.delayed === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400">沒有排隊中的任務。</div>
            ) : (
              <div className="flex flex-col gap-2">
                {[...(data?.waiting ?? []), ...(data?.delayed ?? [])].map((j, i) => (
                  <div key={j.jobId} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 dark:border-gray-200 dark:bg-gray-50">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">{i + 1}</span>
                      {j.owned ? (
                        <Link href={`/studio/${j.projectId}`} className="truncate font-medium text-gray-800 hover:text-blue-600">
                          {j.projectTitle}
                        </Link>
                      ) : (
                        <span className="truncate font-medium text-gray-500">{j.projectTitle}</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                      {j.shotCount > 0 ? <span>{j.shotCount} 鏡</span> : <span>全部分鏡</span>}
                      <Badge color="secondary" variant="flat" size="sm">{j.mode}</Badge>
                      {j.ts && <span className="hidden sm:inline">{ago(j.ts)}</span>}
                      {j.owned && (
                        <Button
                          size="sm"
                          variant="text"
                          className="px-1.5 text-red-500 hover:bg-red-50 hover:text-red-600"
                          isLoading={busy.has(j.jobId)}
                          onClick={() => void onCancel(j, false)}
                          title="取消這筆排隊任務"
                        >
                          <PiXBold className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {data && data.counts.waiting + data.counts.delayed > data.waiting.length + data.delayed.length && (
                  <div className="px-1 pt-1 text-xs text-gray-400">
                    …還有 {data.counts.waiting + data.counts.delayed - (data.waiting.length + data.delayed.length)} 個排隊任務未顯示
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── 統計 ── */}
          {data && (
            <section className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-400">
              <span>執行中 {data.counts.active}</span>
              <span>排隊 {data.counts.waiting + data.counts.delayed}</span>
              <span>已完成 {data.counts.completed}</span>
              <span>失敗 {data.counts.failed}</span>
              {data.comfy && <span>· ComfyUI：跑 {data.comfy.running} / 排 {data.comfy.pending}</span>}
              {vram != null && <span>· 顯存 {vram} GB 可用</span>}
              {ttsUp != null && <span className={ttsUp ? '' : 'text-amber-600 dark:text-amber-400'}>· 配音 {ttsUp ? '連線' : '離線'}</span>}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
