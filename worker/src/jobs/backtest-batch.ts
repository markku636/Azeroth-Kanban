/**
 * 策略比較 processor：單一 job 對同一檔股票跑多個策略並排比較。
 *
 * 為公平比較：載入 K 線「一次」，所有策略 + 單一買進持有 benchmark 皆對齊到
 * globalStart = max(各有效策略 warmup)，再以 startIndex 覆寫起算點。
 * worker 為子列與父批次的「唯一寫入者」：逐 entry 更新子 BacktestRun（前端可增量看到進度），
 * 最後一次寫入父 BacktestBatch 終態（done / partial / failed）。
 */
import type { Job } from 'bullmq';
import {
  buildBuyHoldCurve,
  clampParams,
  getStrategy,
  parseCommonParams,
  runStrategyBacktest,
  type BacktestStats,
} from '@azeroth/common';
import type { BacktestBatchJobData } from '../queue/queues.js';
import { loadKlineRange } from '../data/cache.js';
import { prisma } from '../db.js';
import { log } from '../logger.js';
import { startRun, finishRun, failRun } from '../run-tracker.js';

/** 對齊暖身後至少需要的 K 棒數（太短則年化/回撤無意義）。 */
const MIN_ALIGNED_BARS = 60;

interface ChildOutcome {
  runId: string;
  ok: boolean;
  stats: BacktestStats | null;
}

/** 冠軍排序：年化 DESC → sharpe DESC → 最大回撤 ASC → 交易數 DESC。 */
function compareStats(a: BacktestStats, b: BacktestStats): number {
  if (b.annualizedPct !== a.annualizedPct) {
    return b.annualizedPct - a.annualizedPct;
  }
  const sa = a.sharpe ?? -Infinity;
  const sb = b.sharpe ?? -Infinity;
  if (sb !== sa) {
    return sb - sa;
  }
  if (a.maxDrawdownPct !== b.maxDrawdownPct) {
    return a.maxDrawdownPct - b.maxDrawdownPct;
  }
  return b.totalTrades - a.totalTrades;
}

export async function processBatch(job: Job<BacktestBatchJobData>) {
  const { batchId, symbol, startDate, endDate, common, entries } = job.data;
  const trackId = await startRun('backtest-batch', job.id, symbol, {
    batchId,
    count: entries.length,
  });
  try {
    await prisma.backtestBatch.update({
      where: { id: batchId },
      data: { status: 'running', jobId: job.id ?? null },
    });

    const klines = await loadKlineRange(symbol, startDate, endDate);
    const commonParams = parseCommonParams(common);

    // 解析各 entry：未知策略 / 驗證失敗者標記錯誤、排除於對齊之外
    const resolved = entries.map((entry) => {
      const strat = getStrategy(entry.strategyId);
      if (!strat) {
        return { entry, error: `未知的回測策略：${entry.strategyId}`, warmup: 0 };
      }
      const sp = clampParams(strat, entry.params);
      const vErr = strat.validate(sp);
      return { entry, error: vErr, warmup: vErr ? 0 : strat.warmup(sp) };
    });

    const validWarmups = resolved.filter((r) => !r.error).map((r) => r.warmup);
    if (validWarmups.length === 0) {
      throw new Error('沒有任何有效策略可比較（請檢查策略參數）');
    }
    const globalStart = Math.max(...validWarmups);
    if (klines.length - globalStart < MIN_ALIGNED_BARS) {
      throw new Error(
        `比較區間過短：對齊暖身後僅剩 ${Math.max(0, klines.length - globalStart)} 筆日 K（至少需 ${MIN_ALIGNED_BARS} 筆），請拉長回測期間`,
      );
    }

    // 單一共用買進持有（自 globalStart 起算）
    const buyHoldCurve = buildBuyHoldCurve(klines, globalStart, commonParams);
    const buyHoldFinal = buyHoldCurve.length
      ? buyHoldCurve[buyHoldCurve.length - 1].equity
      : commonParams.initialCapital;
    const buyHoldPct =
      ((buyHoldFinal - commonParams.initialCapital) / commonParams.initialCapital) * 100;
    const globalStartDate = klines[globalStart]?.date ?? null;

    // 逐 entry 跑（以 globalStart 對齊），逐步更新子列
    const outcomes: ChildOutcome[] = [];
    for (const r of resolved) {
      const { entry } = r;
      try {
        if (r.error) {
          throw new Error(r.error);
        }
        await prisma.backtestRun.update({ where: { id: entry.runId }, data: { status: 'running' } });
        const flat = { ...common, ...entry.params };
        const result = runStrategyBacktest(klines, entry.strategyId, flat, globalStart);
        const s = result.stats;
        const curve = result.equityCurve.map((pt) => ({ date: pt.date, equity: pt.equity }));
        await prisma.backtestRun.update({
          where: { id: entry.runId },
          data: {
            status: 'done',
            strategy: entry.strategyId,
            initialCapital: s.initialCapital,
            finalCapital: s.finalCapital,
            totalReturnPct: s.totalReturnPct,
            annualizedPct: s.annualizedPct,
            winRate: s.winRate,
            totalTrades: s.totalTrades,
            maxDrawdownPct: s.maxDrawdownPct,
            profitFactor: s.profitFactor,
            buyHoldPct,
            stats: s as object,
            equityCurve: curve as object,
            trades: result.trades as object,
            error: null,
          },
        });
        outcomes.push({ runId: entry.runId, ok: true, stats: s });
      } catch (e) {
        const msg = (e as Error).message;
        await prisma.backtestRun
          .update({ where: { id: entry.runId }, data: { status: 'failed', error: msg } })
          .catch((err) =>
            log.error('比較子回測狀態更新失敗', { runId: entry.runId, error: (err as Error).message }),
          );
        outcomes.push({ runId: entry.runId, ok: false, stats: null });
      }
    }

    // 冠軍：完成且勝過買進持有者中，依排序取第一
    const done = outcomes.filter((o) => o.ok && o.stats);
    const ranked = done
      .slice()
      .sort((a, b) => compareStats(a.stats as BacktestStats, b.stats as BacktestStats));
    const champion = ranked.find((o) => (o.stats as BacktestStats).totalReturnPct > buyHoldPct);
    const championRunId = champion ? champion.runId : null;

    const okCount = outcomes.filter((o) => o.ok).length;
    const status = okCount === entries.length ? 'done' : okCount === 0 ? 'failed' : 'partial';

    await prisma.backtestBatch.update({
      where: { id: batchId },
      data: {
        status,
        globalStartDate,
        buyHoldPct,
        buyHoldCurve: buyHoldCurve as object,
        championRunId,
        error: status === 'failed' ? '所有策略皆失敗' : null,
      },
    });

    const summary = { batchId, symbol, total: entries.length, done: okCount, status };
    log.info('backtest batch done', summary);
    await finishRun(trackId, summary);
    return summary;
  } catch (e) {
    const msg = (e as Error).message;
    await failRun(trackId, msg);
    // 整批失敗：父 + 仍 pending/running 的子列一併標記
    await prisma.backtestBatch
      .update({ where: { id: batchId }, data: { status: 'failed', error: msg } })
      .catch(() => undefined);
    await prisma.backtestRun
      .updateMany({
        where: { batchId, status: { in: ['pending', 'running'] } },
        data: { status: 'failed', error: msg },
      })
      .catch(() => undefined);
    throw e;
  }
}
