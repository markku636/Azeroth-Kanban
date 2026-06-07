/**
 * 大盤 AI 盤勢解讀 processor：跑 Claude（或降級）→ 落庫 MarketReport（每日去重）。
 */
import type { Job } from 'bullmq';
import type { MarketReportJobData } from '../queue/queues.js';
import { prisma } from '../db.js';
import { log } from '../logger.js';
import { runMarketReportAgent } from '../agent/marketReportAgent.js';
import { startRun, finishRun, failRun } from '../run-tracker.js';

export async function processMarketReport(job: Job<MarketReportJobData>) {
  const runId = await startRun('market-report', job.id, undefined, job.data);
  try {
    const report = await runMarketReportAgent();
    const reportDate = new Date(`${report.reportDate}T00:00:00Z`);

    await prisma.marketReport.upsert({
      where: { reportDate },
      update: {
        title: report.title,
        summary: report.summary,
        body: report.body,
        sentiment: report.sentiment ?? null,
        degraded: report.degraded,
      },
      create: {
        reportDate,
        title: report.title,
        summary: report.summary,
        body: report.body,
        sentiment: report.sentiment ?? null,
        degraded: report.degraded,
      },
    });

    log.info('market-report done', { reportDate: report.reportDate, degraded: report.degraded });
    await finishRun(runId, { title: report.title, degraded: report.degraded });
    return { reportDate: report.reportDate, degraded: report.degraded };
  } catch (e) {
    await failRun(runId, (e as Error).message);
    throw e;
  }
}
