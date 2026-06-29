// GPU 佇列快照：把 BullMQ(studio-pipeline) 的 active/waiting/delayed 轉成「現在在跑什麼 + 還有什麼沒跑」。
// GPU 序列化在單一 worker(concurrency=1)，所以這條佇列就是 GPU 的真實工作清單。
// 權限：比照本 app 的兩層擁有權模型——非本人專案、且無 STUDIO_VIEW_ALL 時，遮蔽標題/連結/分鏡文字，
// 只留「GPU 被佔用 + 排隊位置」這類非敏感資訊（避免洩漏他人專案的腳本/字幕）。
import { prisma } from '@/lib/prisma';
import { pipelineQueue, type PipelineJob } from './queue';
import { getCurrentProgress } from './events';

// admin 容器預設沒有 COMFYUI_URL（只有 worker 有）→ 沒設就不打 loopback，免每次輪詢都 ECONNREFUSED。
const COMFY_URL = process.env.COMFYUI_URL;
const COMFY_HOST = COMFY_URL ? COMFY_URL.replace(/^https?:\/\//, '') : '';

const MAX_LIST = 50; // 顯示用清單上限（單卡序列佇列 backlog 可能很長 → 避免每次反序列化整包）
const TERMINAL = new Set(['done', 'keyframes-done', 'error']); // 終態：不可當成執行中的 live 狀態
const REDACTED_TITLE = '其他使用者的專案';

const MODE_LABEL: Record<string, string> = {
  keyframes: '生成圖片（關鍵幀）',
  render: '生成影片',
};
function modeLabel(mode?: string): string {
  return mode ? (MODE_LABEL[mode] ?? mode) : '完整生成';
}

export interface QueueItem {
  jobId: string;
  projectId: string; // 遮蔽時為空字串（不給深連結 / 不可列舉）
  projectTitle: string;
  mode: string; // 顯示用：生成圖片 / 生成影片 / 完整生成
  shotCount: number; // 0 = 全部分鏡
  owned: boolean; // 本人專案或具 VIEW_ALL → 可顯示細節/連結
  /** 排隊：加入時間(ms)；執行中：開始時間(ms) */
  ts: number | null;
}

export interface ActiveItem extends QueueItem {
  current?: {
    stage: string; // keyframe | voice | video | assemble …（已濾掉終態）
    pct?: number; // 0-1
    status?: string;
    shotIndex?: number; // 1-based，在本次目標分鏡中的位置（僅本人/VIEW_ALL）
    shotTotal?: number;
    shotLabel?: string; // 目前那一鏡的文字（僅本人/VIEW_ALL）
    ageSec: number; // 距離最後一筆進度的秒數
  };
}

export interface QueueStatus {
  active: ActiveItem[];
  waiting: QueueItem[];
  delayed: QueueItem[];
  counts: { active: number; waiting: number; delayed: number; completed: number; failed: number };
  comfy?: { running: number; pending: number };
  degraded?: boolean; // Redis 短暫不可用 → 回空閒置狀態而非 500
  fetchedAt: number;
}

interface TitleEntry {
  title: string;
  ownerId: string;
}

async function titlesFor(projectIds: string[]): Promise<Map<string, TitleEntry>> {
  const ids = projectIds.filter((v, i, a) => a.indexOf(v) === i);
  if (!ids.length) return new Map();
  const rows = await prisma.studioProject.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, ownerId: true },
  });
  return new Map(rows.map((r) => [r.id, { title: r.title, ownerId: r.ownerId }]));
}

function canReveal(projectId: string, titles: Map<string, TitleEntry>, memberId: string, viewAll: boolean): boolean {
  return viewAll || titles.get(projectId)?.ownerId === memberId;
}

function toItem(
  job: { id?: string | null; data: PipelineJob; timestamp?: number; processedOn?: number | null },
  titles: Map<string, TitleEntry>,
  ts: number | null,
  memberId: string,
  viewAll: boolean,
): QueueItem {
  const d = job.data;
  const reveal = canReveal(d.projectId, titles, memberId, viewAll);
  return {
    jobId: job.id ?? '',
    projectId: reveal ? d.projectId : '',
    projectTitle: reveal ? (titles.get(d.projectId)?.title ?? '（未知專案）') : REDACTED_TITLE,
    mode: modeLabel(d.mode),
    shotCount: d.shotIds?.length ?? 0,
    owned: reveal,
    ts,
  };
}

/** 補上執行中那一鏡的位置/文字（第 N / 共 M 鏡）。reveal=false 時只給 stage/pct，不洩漏分鏡文字。 */
async function enrichActive(
  data: PipelineJob,
  reveal: boolean,
  processedOn: number | null,
): Promise<ActiveItem['current'] | undefined> {
  const snap = await getCurrentProgress();
  if (!snap || snap.projectId !== data.projectId) return undefined;
  if (TERMINAL.has(snap.stage)) return undefined; // 別把「已完成」顯示成執行中
  if (processedOn && snap.at < processedOn) return undefined; // 上一個同專案 job 的殘留快照
  const out: NonNullable<ActiveItem['current']> = {
    stage: snap.stage,
    pct: snap.pct,
    status: snap.status,
    ageSec: Math.max(0, Math.round((Date.now() - snap.at) / 1000)),
  };
  if (reveal && snap.shotId) {
    // 目標分鏡清單（指定 shotIds 則只算那些；否則整個專案），依 sortOrder 排序找出目前位置。
    const targets = await prisma.shot.findMany({
      where: { projectId: data.projectId, ...(data.shotIds?.length ? { id: { in: data.shotIds } } : {}) },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, visual: true, caption: true, tts: true },
    });
    const idx = targets.findIndex((s) => s.id === snap.shotId);
    if (idx >= 0) {
      out.shotIndex = idx + 1;
      out.shotTotal = targets.length;
      const s = targets[idx];
      const text = (s.caption || s.visual || s.tts || '').trim();
      if (text) out.shotLabel = text.length > 48 ? `${text.slice(0, 48)}…` : text;
    }
  }
  return out;
}

/** best-effort：請 ComfyUI 中斷目前這次算圖（讓 worker 的 run() 提早返回 → active job 收尾）。 */
async function interruptComfy(): Promise<void> {
  if (!COMFY_HOST) return; // 沒設定就別打 loopback
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    await fetch(`http://${COMFY_HOST}/interrupt`, { method: 'POST', signal: ctrl.signal });
    clearTimeout(t);
  } catch {
    /* ComfyUI 連不到/已掛 → 中斷不了；交給 remove() 與訊息處理 */
  }
}

export interface CancelResult {
  ok: boolean;
  code: 'ok' | 'not_found' | 'forbidden' | 'locked' | 'degraded';
  state?: string;
  message: string;
}

/**
 * 取消佇列中的一筆任務。
 *  - 排隊中/延遲/已完成/已失敗、或正在跑但 worker 已死（鎖過期）→ 直接 remove()。
 *  - 正在跑且 worker 還活著（鎖未過期）→ 先請 ComfyUI /interrupt 中斷本次算圖；remove() 仍可能被鎖擋下，
 *    此時回 locked 讓前端提示「正在執行中，稍候或重啟 worker」。
 * 權限：只能取消本人專案；具 viewAll(EDIT_ALL) 可取消任何人的。
 */
export async function cancelJob(jobId: string, opts: { memberId: string; viewAll: boolean }): Promise<CancelResult> {
  let job: Awaited<ReturnType<typeof pipelineQueue.getJob>>;
  try {
    job = await pipelineQueue.getJob(jobId);
  } catch {
    return { ok: false, code: 'degraded', message: '佇列服務（Redis）暫時無法連線，請稍後再試' };
  }
  if (!job) return { ok: false, code: 'not_found', message: '找不到這個任務（可能已經結束或被移除）' };

  const titles = await titlesFor([job.data.projectId]);
  if (!canReveal(job.data.projectId, titles, opts.memberId, opts.viewAll)) {
    return { ok: false, code: 'forbidden', message: '沒有權限取消其他使用者的任務' };
  }

  const state = await job.getState().catch(() => 'unknown');
  if (state === 'active') await interruptComfy(); // 正在跑：先嘗試中斷本次算圖

  try {
    await job.remove();
    return { ok: true, code: 'ok', state, message: state === 'active' ? '已要求停止並移除目前任務' : '已從排隊中移除' };
  } catch {
    // active 且仍被存活的 worker 鎖住 → 不硬扯（避免破壞正在寫檔的 worker）。
    return {
      ok: false,
      code: 'locked',
      state,
      message: '這個任務正在執行中且被鎖住，已嘗試中斷；若仍卡住，請確認 ComfyUI 是否還活著或重啟 worker',
    };
  }
}

/** 最後手段：讀 ComfyUI 原生 /queue（admin 容器不一定連得到 GPU 主機 → best-effort）。 */
async function comfyQueue(): Promise<QueueStatus['comfy']> {
  if (!COMFY_HOST) return undefined; // 沒設定就別打 loopback
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(`http://${COMFY_HOST}/queue`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return undefined;
    const j = (await r.json()) as { queue_running?: unknown[]; queue_pending?: unknown[] };
    return { running: j.queue_running?.length ?? 0, pending: j.queue_pending?.length ?? 0 };
  } catch {
    return undefined;
  }
}

function emptyStatus(degraded: boolean): QueueStatus {
  return {
    active: [],
    waiting: [],
    delayed: [],
    counts: { active: 0, waiting: 0, delayed: 0, completed: 0, failed: 0 },
    degraded,
    fetchedAt: Date.now(),
  };
}

export async function getQueueStatus(opts: { memberId: string; viewAll: boolean }): Promise<QueueStatus> {
  const { memberId, viewAll } = opts;

  const comfyP = comfyQueue(); // 與 BullMQ 讀取並行；內部已 best-effort，永不 reject
  let active: Awaited<ReturnType<typeof pipelineQueue.getActive>>;
  let waiting: Awaited<ReturnType<typeof pipelineQueue.getWaiting>>;
  let delayed: Awaited<ReturnType<typeof pipelineQueue.getDelayed>>;
  let counts: Awaited<ReturnType<typeof pipelineQueue.getJobCounts>>;
  try {
    [active, waiting, delayed, counts] = await Promise.all([
      pipelineQueue.getActive(0, 9),
      pipelineQueue.getWaiting(0, MAX_LIST - 1),
      pipelineQueue.getDelayed(0, MAX_LIST - 1),
      pipelineQueue.getJobCounts('active', 'waiting', 'delayed', 'completed', 'failed'),
    ]);
  } catch {
    // Redis 短暫不可用：回空閒置狀態，別讓監控端點 500（與 events.ts best-effort 一致）
    await comfyP.catch(() => undefined);
    return emptyStatus(true);
  }

  const comfy = await comfyP;
  const titles = await titlesFor([...active, ...waiting, ...delayed].map((j) => j.data.projectId));

  const activeItems: ActiveItem[] = await Promise.all(
    active.map(async (j) => ({
      ...toItem(j, titles, j.processedOn ?? j.timestamp ?? null, memberId, viewAll),
      current: await enrichActive(
        j.data,
        canReveal(j.data.projectId, titles, memberId, viewAll),
        j.processedOn ?? null,
      ),
    })),
  );

  return {
    active: activeItems,
    waiting: waiting.map((j) => toItem(j, titles, j.timestamp ?? null, memberId, viewAll)),
    delayed: delayed.map((j) => toItem(j, titles, j.timestamp ?? null, memberId, viewAll)),
    counts: {
      active: counts.active ?? 0,
      waiting: counts.waiting ?? 0,
      delayed: counts.delayed ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
    },
    comfy,
    degraded: false,
    fetchedAt: Date.now(),
  };
}
