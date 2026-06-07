/**
 * 建立 BullMQ Workers（concurrency + rate limit + DLQ）。
 */
import { Worker, Queue, type Job } from 'bullmq';
import { redisConnection } from '../queue/connection.js';
import { QUEUE_NAME } from '../queue/queues.js';
import { log } from '../logger.js';
import { processAnalysis } from './analysis.js';
import { processResearch } from './research.js';
import { processDigest } from './digest.js';
import { processLinePush } from './linePush.js';
import { processQa } from './qa.js';
import { processScreen } from './screen.js';
import { processMarket } from './market.js';
import { processGlobal } from './global.js';
import { processMarketReport } from './marketReport.js';
import { processBacktest } from './backtest.js';
import { processBatch } from './backtest-batch.js';
import { reapStaleBatches } from './stale-batch-reaper.js';

/** 失敗耗盡重試後送入死信佇列。 */
function attachDlq(worker: Worker, queueName: string) {
  const dlq = new Queue(`${queueName}-dlq`, { connection: redisConnection });
  worker.on('failed', async (job: Job | undefined, err: Error) => {
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    log.error('job failed', { queue: queueName, jobId: job.id, attempt: job.attemptsMade, exhausted, error: err.message });
    if (exhausted) {
      await dlq.add('dead', { originalId: job.id, data: job.data, reason: err.message });
    }
  });
  worker.on('completed', (job) => log.debug('job completed', { queue: queueName, jobId: job.id }));
}

export function startWorkers(): Worker[] {
  const workers: Worker[] = [];

  // analysis：純資料 + TA，可高並行，控速對齊 FinMind（每分鐘 ~100）
  const analysisWorker = new Worker(QUEUE_NAME.ANALYSIS, processAnalysis, {
    connection: redisConnection,
    concurrency: 4,
    limiter: { max: 60, duration: 60_000 },
  });
  attachDlq(analysisWorker, QUEUE_NAME.ANALYSIS);
  workers.push(analysisWorker);

  // research：較重（web + LLM），低並行
  const researchWorker = new Worker(QUEUE_NAME.RESEARCH, processResearch, {
    connection: redisConnection,
    concurrency: 2,
    limiter: { max: 20, duration: 60_000 },
  });
  attachDlq(researchWorker, QUEUE_NAME.RESEARCH);
  workers.push(researchWorker);

  // digest：每日一次
  const digestWorker = new Worker(QUEUE_NAME.DIGEST, processDigest, {
    connection: redisConnection,
    concurrency: 1,
  });
  attachDlq(digestWorker, QUEUE_NAME.DIGEST);
  workers.push(digestWorker);

  // line-push：推播出訊
  const linePushWorker = new Worker(QUEUE_NAME.LINE_PUSH, processLinePush, {
    connection: redisConnection,
    concurrency: 3,
    limiter: { max: 100, duration: 60_000 },
  });
  attachDlq(linePushWorker, QUEUE_NAME.LINE_PUSH);
  workers.push(linePushWorker);

  // qa：自然語言問答（同步回傳，admin 以 waitUntilFinished 取回）
  const qaWorker = new Worker(QUEUE_NAME.QA, processQa, {
    connection: redisConnection,
    concurrency: 3,
  });
  qaWorker.on('failed', (job, err) => log.error('qa failed', { jobId: job?.id, error: err.message }));
  workers.push(qaWorker);

  // screen：選股掃描（對股池入列 analysis）
  const screenWorker = new Worker(QUEUE_NAME.SCREEN, processScreen, {
    connection: redisConnection,
    concurrency: 1,
  });
  attachDlq(screenWorker, QUEUE_NAME.SCREEN);
  workers.push(screenWorker);

  // market：大盤 / 類股輪動（每日一次）
  const marketWorker = new Worker(QUEUE_NAME.MARKET, processMarket, {
    connection: redisConnection,
    concurrency: 1,
  });
  attachDlq(marketWorker, QUEUE_NAME.MARKET);
  workers.push(marketWorker);

  // global：國際盤 / 期貨夜盤（每日一次）
  const globalWorker = new Worker(QUEUE_NAME.GLOBAL, processGlobal, {
    connection: redisConnection,
    concurrency: 1,
  });
  attachDlq(globalWorker, QUEUE_NAME.GLOBAL);
  workers.push(globalWorker);

  // market-report：大盤 AI 盤勢解讀（較重 LLM，低並行）
  const marketReportWorker = new Worker(QUEUE_NAME.MARKET_REPORT, processMarketReport, {
    connection: redisConnection,
    concurrency: 1,
    limiter: { max: 10, duration: 60_000 },
  });
  attachDlq(marketReportWorker, QUEUE_NAME.MARKET_REPORT);
  workers.push(marketReportWorker);

  // backtest：單筆策略回測（運算輕但保守低並行，不重試）
  const backtestWorker = new Worker(QUEUE_NAME.BACKTEST, processBacktest, {
    connection: redisConnection,
    concurrency: 1,
  });
  attachDlq(backtestWorker, QUEUE_NAME.BACKTEST);
  workers.push(backtestWorker);

  // backtest-batch：策略比較（單一 job 跑完多策略，不重試）
  const backtestBatchWorker = new Worker(QUEUE_NAME.BACKTEST_BATCH, processBatch, {
    connection: redisConnection,
    concurrency: 1,
  });
  attachDlq(backtestBatchWorker, QUEUE_NAME.BACKTEST_BATCH);
  workers.push(backtestBatchWorker);

  // 過期比較批次清道夫（每 5 分鐘掃一次；unref 避免阻擋程序結束）
  const reaperTimer = setInterval(() => {
    void reapStaleBatches().catch((e) =>
      log.error('reapStaleBatches 失敗', { error: (e as Error).message }),
    );
  }, 5 * 60_000);
  reaperTimer.unref();

  log.info('workers started', {
    queues: [
      QUEUE_NAME.ANALYSIS,
      QUEUE_NAME.RESEARCH,
      QUEUE_NAME.DIGEST,
      QUEUE_NAME.LINE_PUSH,
      QUEUE_NAME.QA,
      QUEUE_NAME.SCREEN,
      QUEUE_NAME.MARKET,
      QUEUE_NAME.GLOBAL,
      QUEUE_NAME.MARKET_REPORT,
      QUEUE_NAME.BACKTEST,
      QUEUE_NAME.BACKTEST_BATCH,
    ],
  });
  return workers;
}
