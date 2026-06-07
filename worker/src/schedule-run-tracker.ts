/**
 * ScheduleRun 追蹤 helper（排程層級執行紀錄落庫）。
 *
 * 與 run-tracker.ts（job 層級 AnalysisRun）互補：
 * 這裡記「某個排程 key 的某一次執行」，能涵蓋無單一 job type 的「追蹤關注股」，
 * 並用 trigger 區分排程觸發（schedule）vs 手動觸發（manual）。
 */
import { prisma } from './db.js';

export async function startScheduleRun(key: string, trigger = 'schedule'): Promise<string> {
  const run = await prisma.scheduleRun.create({
    data: { key, trigger, status: 'RUNNING' },
  });
  return run.id;
}

export async function finishScheduleRun(id: string, result: string): Promise<void> {
  await prisma.scheduleRun.update({
    where: { id },
    data: { status: 'DONE', result, finishedAt: new Date() },
  });
}

export async function failScheduleRun(id: string, error: string): Promise<void> {
  await prisma.scheduleRun.update({
    where: { id },
    data: { status: 'FAILED', error, finishedAt: new Date() },
  });
}
