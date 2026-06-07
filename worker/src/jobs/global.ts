/**
 * 國際盤 / 期貨夜盤 processor：抓美股四大指數 + 台指期夜盤 + 三大法人未平倉，落庫 GlobalMarketDaily。
 */
import type { Job } from 'bullmq';
import { loadGlobalMarket } from '../data/global-market.js';
import { log } from '../logger.js';
import { startRun, finishRun, failRun } from '../run-tracker.js';
import {
  startScheduleRun,
  finishScheduleRun,
  failScheduleRun,
} from '../schedule-run-tracker.js';

export async function processGlobal(job: Job<{ trigger?: string }>) {
  const scheduleRunId = await startScheduleRun('daily-global', job.data.trigger ?? 'schedule');
  const runId = await startRun('global', job.id, undefined, job.data);
  try {
    const snap = await loadGlobalMarket();
    const summary = {
      date: snap.date,
      usIndices: snap.usIndices.length,
      txfNightChangePct: snap.txfNight.changePct,
      basis: snap.txfNight.basis,
      hasChips: snap.futChips != null,
    };
    log.info('global job done', summary);
    await finishRun(runId, summary);
    await finishScheduleRun(scheduleRunId, '國際盤已更新');
    return summary;
  } catch (e) {
    const msg = (e as Error).message;
    await failRun(runId, msg);
    await failScheduleRun(scheduleRunId, msg);
    throw e;
  }
}
