/**
 * 漲幅摘要 processor：「昨天在漲什麼」。
 * 抓漲幅排行 → 選配 LLM 解讀 → 落庫為 ResearchReport（symbol='GAINERS'）。
 */
import type { Job } from 'bullmq';
import type { DigestJobData } from '../queue/queues.js';
import { STOCK_DISCLAIMER } from '@azeroth/common';
import { prisma } from '../db.js';
import { log } from '../logger.js';
import { fetchTopGainers } from '../data/twse.js';
import { claudeReason } from '../llm/claude.js';
import { startRun, finishRun, failRun } from '../run-tracker.js';
import {
  startScheduleRun,
  finishScheduleRun,
  failScheduleRun,
} from '../schedule-run-tracker.js';

const GAINERS_SYMBOL = 'GAINERS';

export async function processDigest(job: Job<DigestJobData & { trigger?: string }>) {
  const topN = job.data.topN ?? 15;
  const scheduleRunId = await startScheduleRun('daily-digest', job.data.trigger ?? 'schedule');
  const runId = await startRun('digest', job.id, GAINERS_SYMBOL, job.data);
  try {
    const gainers = await fetchTopGainers(topN);
    const today = new Date().toISOString().slice(0, 10);

    const table = gainers
      .map((g, i) => `${i + 1}. ${g.symbol} ${g.name}　+${g.changePercent}%　收 ${g.close}`)
      .join('\n');

    // 選配：用 Claude 解讀漲因
    const explanation = await claudeReason(
      `以下是台股今日漲幅排行榜，請用繁體中文簡要分析可能的族群/題材輪動與共通原因（條列，3~6 點）：\n${table}`,
      { maxTurns: 4 },
    );

    const body = [
      `# 今日台股漲幅排行（${today}）`,
      '',
      table || '（無資料）',
      '',
      '## 漲因分析',
      explanation ?? '（AI 漲因解讀暫時無法產生，以上為今日漲幅排行）',
      '',
      '---',
      STOCK_DISCLAIMER,
    ].join('\n');

    const reportDate = new Date(`${today}T00:00:00Z`);
    await prisma.researchReport.upsert({
      where: { symbol_reportDate: { symbol: GAINERS_SYMBOL, reportDate } },
      update: { title: `漲幅排行 ${today}`, summary: `共 ${gainers.length} 檔`, body, sources: [], sentiment: 'positive' },
      create: { symbol: GAINERS_SYMBOL, reportDate, title: `漲幅排行 ${today}`, summary: `共 ${gainers.length} 檔`, body, sources: [], sentiment: 'positive' },
    });

    log.info('digest done', { count: gainers.length, llm: Boolean(explanation) });
    await finishRun(runId, { count: gainers.length });
    await finishScheduleRun(scheduleRunId, `漲幅榜 ${gainers.length} 檔`);
    return { count: gainers.length };
  } catch (e) {
    const msg = (e as Error).message;
    await failRun(runId, msg);
    await failScheduleRun(scheduleRunId, msg);
    throw e;
  }
}
