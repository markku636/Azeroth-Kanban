/**
 * 過期比較批次清道夫。
 *
 * 比較 batch 佇列為 attempts:1（不重試，避免重複落庫）。若 worker 在跑批途中崩潰，
 * 父批次會永遠卡在 running、子列卡在 pending/running。此 reaper 週期性把「逾時且久未更新」的
 * batch 標為 failed，避免前端無限輪詢。正常進行中的 batch 每寫一個子列就會更新 updatedAt，不受影響。
 */
import { prisma } from '../db.js';
import { log } from '../logger.js';

/** 視為過期的閒置時間（毫秒）。 */
const STALE_MS = 10 * 60_000;

/** 將逾時仍 pending/running 的 batch 與其未完成子列標為 failed，回傳清掉的批次數。 */
export async function reapStaleBatches(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MS);
  const stale = await prisma.backtestBatch.findMany({
    where: { status: { in: ['pending', 'running'] }, updatedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (stale.length === 0) {
    return 0;
  }
  for (const b of stale) {
    const reason = '比較逾時未完成（worker 可能曾中斷），已標記為失敗';
    await prisma.backtestBatch
      .update({ where: { id: b.id }, data: { status: 'failed', error: reason } })
      .catch(() => undefined);
    await prisma.backtestRun
      .updateMany({
        where: { batchId: b.id, status: { in: ['pending', 'running'] } },
        data: { status: 'failed', error: reason },
      })
      .catch(() => undefined);
  }
  log.warn('stale backtest batches reaped', { count: stale.length });
  return stale.length;
}
