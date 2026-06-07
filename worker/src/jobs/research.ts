/**
 * 研究 processor：跑 Deep Agent（或降級）→ 落庫 ResearchReport。
 */
import type { Job } from 'bullmq';
import type { ResearchJobData } from '../queue/queues.js';
import { prisma } from '../db.js';
import { log } from '../logger.js';
import { runResearchAgent } from '../agent/deepAgent.js';
import { startRun, finishRun, failRun } from '../run-tracker.js';

export async function processResearch(job: Job<ResearchJobData>) {
  const { symbol } = job.data;
  const runId = await startRun('research', job.id, symbol, job.data);
  try {
    const report = await runResearchAgent(symbol);
    const reportDate = new Date(`${report.reportDate}T00:00:00Z`);

    await prisma.researchReport.upsert({
      where: { symbol_reportDate: { symbol, reportDate } },
      update: {
        title: report.title,
        summary: report.summary,
        body: report.body,
        sources: report.sources as object,
        sentiment: report.sentiment ?? null,
      },
      create: {
        symbol,
        reportDate,
        title: report.title,
        summary: report.summary,
        body: report.body,
        sources: report.sources as object,
        sentiment: report.sentiment ?? null,
      },
    });

    log.info('research done', { symbol, sentiment: report.sentiment });
    await finishRun(runId, { title: report.title, sentiment: report.sentiment });
    return { symbol, title: report.title };
  } catch (e) {
    await failRun(runId, (e as Error).message);
    throw e;
  }
}
