/**
 * BullMQ 佇列定義（producer / consumer 共用名稱）。
 *
 * 四條佇列：
 *  - analysis  ：單檔買賣訊號分析
 *  - research  ：單檔深度研究報告
 *  - digest    ：每日漲幅摘要（昨天在漲什麼）
 *  - line-push ：LINE 推播出訊
 */
import { Queue, type JobsOptions } from 'bullmq';
import { StockJobType } from '@azeroth/common';
import { redisConnection } from './connection.js';

export const QUEUE_NAME = {
  ANALYSIS: StockJobType.ANALYSIS,
  RESEARCH: StockJobType.RESEARCH,
  DIGEST: StockJobType.DIGEST,
  LINE_PUSH: StockJobType.LINE_PUSH,
  QA: StockJobType.QA,
  SCREEN: StockJobType.SCREEN,
  MARKET: StockJobType.MARKET,
  GLOBAL: StockJobType.GLOBAL,
  MARKET_REPORT: StockJobType.MARKET_REPORT,
  BACKTEST: StockJobType.BACKTEST,
  BACKTEST_BATCH: StockJobType.BACKTEST_BATCH,
} as const;

/** 預設 job 選項：重試 + 指數退避 + 自動清理。 */
export const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};

const connection = redisConnection;

export const analysisQueue = new Queue(QUEUE_NAME.ANALYSIS, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
export const researchQueue = new Queue(QUEUE_NAME.RESEARCH, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
export const digestQueue = new Queue(QUEUE_NAME.DIGEST, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
export const linePushQueue = new Queue(QUEUE_NAME.LINE_PUSH, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
export const qaQueue = new Queue(QUEUE_NAME.QA, { connection, defaultJobOptions: { attempts: 1, removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } } });
export const screenQueue = new Queue(QUEUE_NAME.SCREEN, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
export const marketQueue = new Queue(QUEUE_NAME.MARKET, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
export const globalQueue = new Queue(QUEUE_NAME.GLOBAL, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
export const marketReportQueue = new Queue(QUEUE_NAME.MARKET_REPORT, { connection, defaultJobOptions: DEFAULT_JOB_OPTS });
// backtest：回測運算單次（不重試，避免重複落庫；保留較多歷史供查詢）
export const backtestQueue = new Queue(QUEUE_NAME.BACKTEST, {
  connection,
  defaultJobOptions: { attempts: 1, removeOnComplete: { count: 200 }, removeOnFail: { count: 200 } },
});
// backtest-batch：策略比較（單一 job 跑完所有策略，不重試避免重複落庫）
export const backtestBatchQueue = new Queue(QUEUE_NAME.BACKTEST_BATCH, {
  connection,
  defaultJobOptions: { attempts: 1, removeOnComplete: { count: 200 }, removeOnFail: { count: 200 } },
});

/** job payload 型別 */
export interface AnalysisJobData {
  symbol: string;
  /** 觸發來源：schedule / manual / line */
  trigger?: string;
}
export interface ResearchJobData {
  symbol: string;
  trigger?: string;
}
export interface DigestJobData {
  /** 取前幾名漲幅 */
  topN?: number;
}
export interface LinePushJobData {
  to: string | string[];
  /** LINE message 物件陣列（已組好） */
  messages: unknown[];
}
export interface QaJobData {
  question: string;
  /** 可選股票代號（問題若含代號可帶入） */
  symbol?: string;
}
export interface QaJobResult {
  answer: string;
}
export interface MarketReportJobData {
  trigger?: string;
}
export interface BacktestJobData {
  /** 對應 admin 預先建立的 BacktestRun.id */
  runId: string;
  symbol: string;
  /** 回測起日 YYYY-MM-DD（含） */
  startDate: string;
  /** 回測迄日 YYYY-MM-DD（含） */
  endDate: string;
  /** 策略 id（預設 kd；舊資料省略時視為 kd） */
  strategy?: string;
  /** 扁平合併參數（共用 + 策略專屬；admin 已正規化夾擠） */
  params: Record<string, number>;
  trigger?: string;
}

/** 比較批次中的單一策略項目。 */
export interface BacktestEntry {
  /** 對應的子 BacktestRun.id（admin 預先建立） */
  runId: string;
  strategyId: string;
  params: Record<string, number>;
  /** 顯示標籤（同策略不同參數時已去重） */
  label: string;
}

export interface BacktestBatchJobData {
  /** 對應 admin 預先建立的 BacktestBatch.id */
  batchId: string;
  symbol: string;
  startDate: string;
  endDate: string;
  /** 共用參數（扁平：本金 / 費率 / 停損停利） */
  common: Record<string, number>;
  /** 2..8 個策略項目 */
  entries: BacktestEntry[];
  trigger?: string;
}

/** 台北時區的今日日期（YYYY-MM-DD），對齊台股交易日，避免 UTC 跨日造成 dedup 錯誤。 */
function taipeiDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
}

/** 以 symbol+date 去重的 jobId。注意：BullMQ 保留 `:`，jobId 一律用 `-`。 */
export function dedupJobId(prefix: string, symbol: string): string {
  return `${prefix}-${symbol}-${taipeiDateStr()}`;
}

/** 入列分析 job（去重）。 */
export function enqueueAnalysis(symbol: string, trigger = 'manual') {
  return analysisQueue.add('analyze', { symbol, trigger } satisfies AnalysisJobData, {
    jobId: dedupJobId('analysis', symbol),
  });
}

/** 入列研究 job（去重）。 */
export function enqueueResearch(symbol: string, trigger = 'manual') {
  return researchQueue.add('research', { symbol, trigger } satisfies ResearchJobData, {
    jobId: dedupJobId('research', symbol),
  });
}

/** 入列選股掃描 job（每日去重）。注意：screen 佇列有 scheduler，jobId 不可含 `:`。 */
export function enqueueScreen(trigger = 'manual') {
  return screenQueue.add('screen', { trigger }, { jobId: `screen-${taipeiDateStr()}` });
}

/** 入列大盤 job（每日去重）。注意：market 佇列有 scheduler，jobId 不可含 `:`。 */
export function enqueueMarket(trigger = 'manual') {
  return marketQueue.add('market', { trigger }, { jobId: `market-${taipeiDateStr()}` });
}

/** 入列國際盤 / 期貨夜盤 job（每日去重）。注意：global 佇列有 scheduler，jobId 不可含 `:`。 */
export function enqueueGlobal(trigger = 'manual') {
  return globalQueue.add('global', { trigger }, { jobId: `global-${taipeiDateStr()}` });
}

/**
 * 入列大盤 AI 盤勢解讀 job。
 * @param force true=手動強制重跑（唯一 jobId，不受當日 dedup 阻擋）；false=每日去重
 */
export function enqueueMarketReport(trigger = 'manual', force = false) {
  const jobId = force
    ? `manual-market-report-${Date.now()}`
    : `market-report-${taipeiDateStr()}`;
  return marketReportQueue.add('market-report', { trigger }, { jobId });
}
