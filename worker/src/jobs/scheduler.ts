/**
 * 排程：平日隔天盤前（Asia/Taipei）。
 *   - daily-track（08:40）：對 watchlist 每檔入列 analysis + research（去重）
 *   - daily-digest（08:40）：跑漲幅摘要
 *   - daily-screen（08:40）：股池選股掃描
 *   - daily-market（08:40）：大盤 / 類股輪動
 *   - daily-market-report（09:00）：大盤 AI 盤勢解讀（晚於 market 20 分）
 *
 * 改至盤前因 FinMind 當日資料約凌晨才到齊（見 docs/specs 20260607-006）。
 * 用 BullMQ upsertJobScheduler；啟動時讀 ScheduleConfig 套用使用者覆寫的時間 / 啟用。
 */
import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../queue/connection.js';
import {
  digestQueue,
  screenQueue,
  marketQueue,
  globalQueue,
  marketReportQueue,
  enqueueAnalysis,
  enqueueResearch,
} from '../queue/queues.js';
import { prisma } from '../db.js';
import { log } from '../logger.js';
import {
  startScheduleRun,
  finishScheduleRun,
  failScheduleRun,
} from '../schedule-run-tracker.js';

const DISPATCH_QUEUE = 'dispatch';
const TZ = 'Asia/Taipei';

const dispatchQueue = new Queue(DISPATCH_QUEUE, { connection: redisConnection });

/** 排程定義（key 與 admin 端一致）。 */
interface ScheduleDef {
  key: string;
  queue: Queue;
  defaultPattern: string;
  jobName: string;
  data: Record<string, unknown>;
}

// 盤後分析類改至「隔天盤前 08:40」執行：FinMind 當日台股日資料約交易日深夜~凌晨才到齊，
// 盤前才能確保拿到前一交易日的完整資料（價格 + 籌碼 + 法人）。
const SCHEDULES: ScheduleDef[] = [
  { key: 'daily-track', queue: dispatchQueue, defaultPattern: '40 8 * * 1-5', jobName: 'track', data: { trigger: 'schedule' } },
  { key: 'daily-digest', queue: digestQueue, defaultPattern: '40 8 * * 1-5', jobName: 'digest', data: { topN: 15, trigger: 'schedule' } },
  { key: 'daily-screen', queue: screenQueue, defaultPattern: '40 8 * * 1-5', jobName: 'screen', data: { trigger: 'schedule' } },
  { key: 'daily-market', queue: marketQueue, defaultPattern: '40 8 * * 1-5', jobName: 'market', data: { trigger: 'schedule' } },
  // 國際盤 / 期貨夜盤：07:00 週二~六（涵蓋美股收盤 ~04–05:00 與台指期夜盤結束 05:00，DST 也安全）
  { key: 'daily-global', queue: globalQueue, defaultPattern: '0 7 * * 2-6', jobName: 'global', data: { trigger: 'schedule' } },
  // 大盤 AI 盤勢解讀：09:00 平日（晚於大盤 08:40 抓取 20 分，確保 marketDaily 已落庫可解讀）
  { key: 'daily-market-report', queue: marketReportQueue, defaultPattern: '0 9 * * 1-5', jobName: 'market-report', data: { trigger: 'schedule' } },
];

/** dispatcher：讀取 active watchlist，對每檔入列 analysis + research。 */
async function dispatchWatchlist(trigger = 'schedule') {
  const scheduleRunId = await startScheduleRun('daily-track', trigger);
  try {
    const rows = await prisma.watchlist.findMany({
      where: { isActive: true },
      select: { symbol: true },
      distinct: ['symbol'],
    });
    let n = 0;
    for (const { symbol } of rows) {
      await enqueueAnalysis(symbol, 'schedule');
      await enqueueResearch(symbol, 'schedule');
      n++;
    }
    log.info('dispatch watchlist', { symbols: n });
    await finishScheduleRun(scheduleRunId, `派發 ${n} 檔（分析+研究）`);
    return { symbols: n };
  } catch (e) {
    await failScheduleRun(scheduleRunId, (e as Error).message);
    throw e;
  }
}

/** 啟動排程 + dispatcher worker。讀 ScheduleConfig 套用覆寫設定。 */
export async function startScheduler(): Promise<Worker> {
  // dispatcher worker（job.data.trigger 區分排程 / 手動觸發）
  const dispatcher = new Worker(
    DISPATCH_QUEUE,
    async (job) => dispatchWatchlist((job.data as { trigger?: string })?.trigger),
    {
      connection: redisConnection,
      concurrency: 1,
    },
  );

  const configs = await prisma.scheduleConfig.findMany();
  const byKey = new Map(configs.map((c) => [c.key, c]));

  for (const s of SCHEDULES) {
    const cfg = byKey.get(s.key);
    const pattern = cfg?.pattern ?? s.defaultPattern;
    const enabled = cfg?.enabled ?? true;
    if (enabled) {
      await s.queue.upsertJobScheduler(
        s.key,
        { pattern, tz: TZ },
        { name: s.jobName, data: s.data },
      );
    } else {
      await s.queue.removeJobScheduler(s.key).catch(() => undefined);
    }
  }

  log.info('scheduler registered', { count: SCHEDULES.length, overrides: configs.length, tz: TZ });
  return dispatcher;
}

/** 供手動/測試觸發。 */
export { dispatchWatchlist };
