/**
 * 選股掃描 processor：對股池每檔入列 analysis（填多因子評分），
 * 之後 admin 選股器讀 AnalysisSignal.score 排行。
 */
import type { Job } from 'bullmq';
import { STOCK_POOL } from '../data/pool.js';
import { enqueueAnalysis } from '../queue/queues.js';
import { prisma } from '../db.js';
import { log } from '../logger.js';
import { startRun, finishRun, failRun } from '../run-tracker.js';
import {
  startScheduleRun,
  finishScheduleRun,
  failScheduleRun,
} from '../schedule-run-tracker.js';

export async function processScreen(job: Job<{ trigger?: string }>) {
  const scheduleRunId = await startScheduleRun('daily-screen', job.data.trigger ?? 'schedule');
  const runId = await startRun('screen', job.id, undefined, job.data);
  try {
    // 股池 + active watchlist 去重
    const watch = await prisma.watchlist.findMany({
      where: { isActive: true },
      select: { symbol: true },
      distinct: ['symbol'],
    });
    const symbols = [...new Set([...STOCK_POOL, ...watch.map((w) => w.symbol)])];

    for (const symbol of symbols) {
      await enqueueAnalysis(symbol, 'screen');
    }
    log.info('screen dispatched', { count: symbols.length });
    await finishRun(runId, { dispatched: symbols.length });
    await finishScheduleRun(scheduleRunId, `派發 ${symbols.length} 檔`);
    return { dispatched: symbols.length };
  } catch (e) {
    const msg = (e as Error).message;
    await failRun(runId, msg);
    await failScheduleRun(scheduleRunId, msg);
    throw e;
  }
}
