/**
 * 股票機器人 — BullMQ producer（admin 端入列 job 到 worker 消化）。
 *
 * admin 只負責入列;實際處理由 worker 進程完成。
 * 缺 Redis 時入列會丟錯,由 service 層捕捉轉成錯誤 ApiResult。
 */
import { Queue, QueueEvents, type JobsOptions, type RedisOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { StockJobType } from '@azeroth/common';

const HEARTBEAT_KEY = 'stock:worker:heartbeat';
/** worker 心跳逾時（毫秒）；超過視為離線。 */
const HEARTBEAT_STALE_MS = 90_000;

const connection: RedisOptions = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? '6379'),
  maxRetriesPerRequest: null,
};

const JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};

// 單例佇列（避免每次請求建立連線）
const globalForQueue = globalThis as unknown as {
  __stockQueues?: Record<string, Queue>;
};
const queues = (globalForQueue.__stockQueues ??= {});

function getQueue(name: string): Queue {
  queues[name] ??= new Queue(name, { connection, defaultJobOptions: JOB_OPTS });
  return queues[name];
}

/** 台北時區的今日日期（YYYY-MM-DD），對齊台股交易日，避免 UTC 跨日造成 dedup 錯誤。 */
function taipeiDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
}

// 注意：BullMQ 保留 `:`，custom jobId 不可含 `:`（會丟 "Custom Id cannot contain :"），一律用 `-`。
function dedupJobId(prefix: string, symbol: string): string {
  return `${prefix}-${symbol}-${taipeiDateStr()}`;
}

/** 強制重跑用的唯一 jobId（不含 `:`，BullMQ 保留字元）。 */
function forceJobId(prefix: string, symbol: string): string {
  return `manual-${prefix}-${symbol}-${Date.now()}`;
}

/** 無 symbol 的強制觸發唯一 jobId（screen / market / global / dispatch 等排程佇列）。 */
function manualJobId(prefix: string): string {
  return `manual-${prefix}-${Date.now()}`;
}

/**
 * 入列分析 job。
 * @param force true=手動強制重跑（唯一 jobId，不受當日 dedup 阻擋）；false=每日去重
 */
export async function enqueueAnalysis(
  symbol: string,
  trigger = 'manual',
  force = false,
): Promise<string> {
  const jobId = force ? forceJobId('analysis', symbol) : dedupJobId('analysis', symbol);
  const job = await getQueue(StockJobType.ANALYSIS).add('analyze', { symbol, trigger }, { jobId });
  return job.id ?? jobId;
}

export async function enqueueResearch(
  symbol: string,
  trigger = 'manual',
  force = false,
): Promise<string> {
  const jobId = force ? forceJobId('research', symbol) : dedupJobId('research', symbol);
  const job = await getQueue(StockJobType.RESEARCH).add('research', { symbol, trigger }, { jobId });
  return job.id ?? jobId;
}

export async function enqueueDigest(topN = 15, trigger = 'manual'): Promise<string> {
  const job = await getQueue(StockJobType.DIGEST).add('digest', { topN, trigger });
  return job.id ?? 'digest';
}

/**
 * 入列選股掃描 job。
 * @param force true=手動立即執行（唯一 jobId，繞過當日去重）；false=每日去重
 */
export async function enqueueScreen(force = false): Promise<string> {
  // screen 佇列有 scheduler，jobId 不可含 `:`
  const jobId = force ? manualJobId('screen') : `screen-${taipeiDateStr()}`;
  const job = await getQueue(StockJobType.SCREEN).add('screen', { trigger: 'manual' }, { jobId });
  return job.id ?? jobId;
}

/**
 * 入列大盤 job。
 * @param force true=手動立即執行（唯一 jobId，繞過當日去重）；false=每日去重
 */
export async function enqueueMarket(force = false): Promise<string> {
  // market 佇列有 scheduler，jobId 不可含 `:`
  const jobId = force ? manualJobId('market') : `market-${taipeiDateStr()}`;
  const job = await getQueue(StockJobType.MARKET).add('market', { trigger: 'manual' }, { jobId });
  return job.id ?? jobId;
}

/**
 * 入列國際盤 / 期貨夜盤 job。
 * @param force true=手動立即執行（唯一 jobId，繞過當日去重）；false=每日去重
 */
export async function enqueueGlobal(force = false): Promise<string> {
  // global 佇列有 scheduler，jobId 不可含 `:`
  const jobId = force ? manualJobId('global') : `global-${taipeiDateStr()}`;
  const job = await getQueue(StockJobType.GLOBAL).add('global', { trigger: 'manual' }, { jobId });
  return job.id ?? jobId;
}

/** 手動派發追蹤關注股：對 dispatch 佇列入列 track job（唯一 jobId 繞過去重）。 */
export async function enqueueDispatch(trigger = 'manual'): Promise<string> {
  const jobId = manualJobId('dispatch');
  const job = await getQueue('dispatch').add('track', { trigger }, { jobId });
  return job.id ?? jobId;
}

/**
 * 入列大盤 AI 盤勢解讀 job。
 * @param force true=手動強制重跑（唯一 jobId，不受當日 dedup 阻擋）；false=每日去重
 */
export async function enqueueMarketReport(force = false): Promise<string> {
  // market-report 佇列有 scheduler，jobId 不可含 `:`
  const jobId = force
    ? `manual-market-report-${Date.now()}`
    : `market-report-${taipeiDateStr()}`;
  const job = await getQueue(StockJobType.MARKET_REPORT).add(
    'market-report',
    { trigger: 'manual' },
    { jobId },
  );
  return job.id ?? jobId;
}

/**
 * 入列單筆策略回測 job（唯一 jobId，不去重；每次參數不同都要跑）。
 * @param runId 對應 admin 預先建立的 BacktestRun.id
 */
export async function enqueueBacktest(data: {
  runId: string;
  symbol: string;
  startDate: string;
  endDate: string;
  strategy: string;
  /** 扁平合併參數（共用 + 策略專屬） */
  params: Record<string, number>;
}): Promise<string> {
  const jobId = `backtest-${data.symbol}-${data.runId}`;
  const job = await getQueue(StockJobType.BACKTEST).add(
    'backtest',
    { ...data, trigger: 'manual' },
    { jobId },
  );
  return job.id ?? jobId;
}

/** 比較批次中的單一策略項目（含對應子 BacktestRun.id）。 */
export interface ComparisonEntry {
  runId: string;
  strategyId: string;
  params: Record<string, number>;
  label: string;
}

/**
 * 入列策略比較 batch job（單一 job 跑完所有策略；唯一 jobId，不去重）。
 * @param batchId 對應 admin 預先建立的 BacktestBatch.id
 */
export async function enqueueComparison(data: {
  batchId: string;
  symbol: string;
  startDate: string;
  endDate: string;
  /** 共用參數（扁平：本金 / 費率 / 停損停利） */
  common: Record<string, number>;
  entries: ComparisonEntry[];
}): Promise<string> {
  const jobId = `comparison-${data.symbol}-${data.batchId}`;
  const job = await getQueue(StockJobType.BACKTEST_BATCH).add(
    'backtest-batch',
    { ...data, trigger: 'manual' },
    { jobId },
  );
  return job.id ?? jobId;
}

// ─── 自然語言問答（同步等 worker 回答）───
const globalForQe = globalThis as unknown as { __qaEvents?: QueueEvents };

function getQaEvents(): QueueEvents {
  globalForQe.__qaEvents ??= new QueueEvents(StockJobType.QA, { connection });
  return globalForQe.__qaEvents;
}

/**
 * 問一個自然語言問題，等 worker（Claude）回答。
 * @param timeoutMs 等待上限，預設 130s（Claude latency）
 */
export async function askQuestion(
  question: string,
  symbol?: string,
  timeoutMs = 130_000,
): Promise<string> {
  const qe = getQaEvents();
  await qe.waitUntilReady();
  const job = await getQueue(StockJobType.QA).add('qa', { question, symbol });
  const result = (await job.waitUntilFinished(qe, timeoutMs)) as { answer?: string } | undefined;
  return result?.answer ?? '（暫時無法取得回答）';
}

// ─── 監控（佇列數量 / worker 心跳 / 重新入列）───

const MONITORED_QUEUES = [
  StockJobType.ANALYSIS,
  StockJobType.RESEARCH,
  StockJobType.DIGEST,
  StockJobType.LINE_PUSH,
  StockJobType.QA,
  StockJobType.SCREEN,
  StockJobType.MARKET,
  StockJobType.GLOBAL,
  StockJobType.MARKET_REPORT,
  StockJobType.BACKTEST,
  StockJobType.BACKTEST_BATCH,
] as const;

export interface QueueCount {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

/** 各佇列 job 數量。 */
export async function getQueueCounts(): Promise<QueueCount[]> {
  const out: QueueCount[] = [];
  for (const name of MONITORED_QUEUES) {
    const c = await getQueue(name).getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    );
    out.push({
      name,
      waiting: c.waiting ?? 0,
      active: c.active ?? 0,
      completed: c.completed ?? 0,
      failed: c.failed ?? 0,
      delayed: c.delayed ?? 0,
    });
  }
  return out;
}

// ─── 排程任務（未來要做什麼 + 可編輯時間）───

export const SCHEDULE_TZ = 'Asia/Taipei';

export interface EditableSchedule {
  queue: string;
  jobName: string;
  data: Record<string, unknown>;
  label: string;
  defaultPattern: string;
}

/** 可編輯排程註冊表（key 與 worker scheduler.ts 一致）。 */
export const EDITABLE_SCHEDULES: Record<string, EditableSchedule> = {
  'daily-track': {
    queue: 'dispatch',
    jobName: 'track',
    data: { trigger: 'schedule' },
    label: '追蹤關注股（分析 + 研究）',
    defaultPattern: '40 8 * * 1-5',
  },
  'daily-digest': {
    queue: StockJobType.DIGEST,
    jobName: 'digest',
    data: { topN: 15, trigger: 'schedule' },
    label: '每日漲幅摘要',
    defaultPattern: '40 8 * * 1-5',
  },
  'daily-screen': {
    queue: StockJobType.SCREEN,
    jobName: 'screen',
    data: { trigger: 'schedule' },
    label: '股池選股掃描',
    defaultPattern: '40 8 * * 1-5',
  },
  'daily-market': {
    queue: StockJobType.MARKET,
    jobName: 'market',
    data: { trigger: 'schedule' },
    label: '大盤 / 類股輪動',
    defaultPattern: '40 8 * * 1-5',
  },
  'daily-global': {
    queue: StockJobType.GLOBAL,
    jobName: 'global',
    data: { trigger: 'schedule' },
    label: '國際盤 / 期貨夜盤',
    defaultPattern: '0 7 * * 2-6',
  },
  'daily-market-report': {
    queue: StockJobType.MARKET_REPORT,
    jobName: 'market-report',
    data: { trigger: 'schedule' },
    label: '大盤 AI 盤勢解讀',
    defaultPattern: '0 9 * * 1-5',
  },
};

/** 取各 scheduler 的下次執行時間（key → next ms）。 */
export async function getSchedulerNextRuns(): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const queues = Array.from(new Set(Object.values(EDITABLE_SCHEDULES).map((s) => s.queue)));
  for (const qName of queues) {
    const schedulers = await getQueue(qName).getJobSchedulers(0, -1, true);
    for (const s of schedulers) {
      const key = s.key ?? s.id ?? '';
      out.set(key, s.next != null ? Number(s.next) : null);
    }
  }
  return out;
}

/** 套用排程到 BullMQ：enabled → upsert（即時改下次執行）、disabled → remove。 */
export async function applySchedule(key: string, pattern: string, enabled: boolean): Promise<void> {
  const def = EDITABLE_SCHEDULES[key];
  if (!def) {
    throw new Error(`未知排程：${key}`);
  }
  const q = getQueue(def.queue);
  if (enabled) {
    await q.upsertJobScheduler(
      key,
      { pattern, tz: SCHEDULE_TZ },
      { name: def.jobName, data: def.data },
    );
  } else {
    await q.removeJobScheduler(key);
  }
}

const globalForRedis = globalThis as unknown as { __stockRedis?: Redis };
function getRedisClient(): Redis {
  globalForRedis.__stockRedis ??= new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? '6379'),
    maxRetriesPerRequest: null,
  });
  return globalForRedis.__stockRedis;
}

export interface WorkerHeartbeat {
  online: boolean;
  lastBeatAt: number | null;
  ageMs: number | null;
}

/** 讀 worker 心跳，判斷在線。 */
export async function getHeartbeat(): Promise<WorkerHeartbeat> {
  try {
    const raw = await getRedisClient().get(HEARTBEAT_KEY);
    if (!raw) {
      return { online: false, lastBeatAt: null, ageMs: null };
    }
    const ts = Number(raw);
    const ageMs = Date.now() - ts;
    return { online: ageMs <= HEARTBEAT_STALE_MS, lastBeatAt: ts, ageMs };
  } catch {
    return { online: false, lastBeatAt: null, ageMs: null };
  }
}

/** 依 type + symbol 重新入列（給失敗 job 重跑用，用唯一 jobId 避免去重擋下）。 */
export async function requeueByType(type: string, symbol?: string): Promise<boolean> {
  const uniqueId = `retry-${type}-${symbol ?? 'x'}-${Date.now()}`;
  if (type === StockJobType.ANALYSIS && symbol) {
    await getQueue(StockJobType.ANALYSIS).add(
      'analyze',
      { symbol, trigger: 'retry' },
      { jobId: uniqueId },
    );
    return true;
  }
  if (type === StockJobType.RESEARCH && symbol) {
    await getQueue(StockJobType.RESEARCH).add(
      'research',
      { symbol, trigger: 'retry' },
      { jobId: uniqueId },
    );
    return true;
  }
  if (type === StockJobType.DIGEST) {
    await getQueue(StockJobType.DIGEST).add('digest', { topN: 15 }, { jobId: uniqueId });
    return true;
  }
  return false;
}
