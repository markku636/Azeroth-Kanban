/**
 * 大盤 processor：抓取加權指數 + 漲跌家數 + 類股輪動，落庫 MarketDaily。
 */
import type { Job } from 'bullmq';
import { loadMarket } from '../data/market.js';
import { log } from '../logger.js';
import { startRun, finishRun, failRun } from '../run-tracker.js';
import {
  startScheduleRun,
  finishScheduleRun,
  failScheduleRun,
} from '../schedule-run-tracker.js';

export async function processMarket(job: Job<{ trigger?: string }>) {
  const scheduleRunId = await startScheduleRun('daily-market', job.data.trigger ?? 'schedule');
  const runId = await startRun('market', job.id, undefined, job.data);
  try {
    const snap = await loadMarket();
    const summary = {
      date: snap.date.toISOString().slice(0, 10),
      taiexChangePct: snap.taiexChangePct,
      advancers: snap.advancers,
      decliners: snap.decliners,
      sectors: snap.sectors.length,
    };
    log.info('market job done', summary);
    await finishRun(runId, summary);
    await finishScheduleRun(scheduleRunId, '大盤已更新');
    return summary;
  } catch (e) {
    const msg = (e as Error).message;
    await failRun(runId, msg);
    await failScheduleRun(scheduleRunId, msg);
    throw e;
  }
}
