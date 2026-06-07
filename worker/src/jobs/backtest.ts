/**
 * 回測 processor：以歷史日 K 對單一個股跑「指定策略」回測，落庫 BacktestRun。
 *
 * 流程：normalize 參數（相容舊 KD 扁平資料）→ load 歷史 K（不足則補抓）→ runStrategyBacktest
 * （common 純函式，依 strategy 派發）→ 更新 BacktestRun（done + 摘要 + JSON）。
 * 同時用 run-tracker 落 AnalysisRun，讓監控頁看得到此 job。
 */
import type { Job } from 'bullmq';
import { clampParams, getStrategy, normalizeStoredParams, runStrategyBacktest } from '@azeroth/common';
import type { BacktestJobData } from '../queue/queues.js';
import { loadKlineRange } from '../data/cache.js';
import { prisma } from '../db.js';
import { log } from '../logger.js';
import { startRun, finishRun, failRun } from '../run-tracker.js';

/** 至少需要的 K 棒數（warmup + 幾根才有訊號）。 */
const MIN_BARS_BUFFER = 5;

export async function processBacktest(job: Job<BacktestJobData>) {
  const { runId, symbol, startDate, endDate } = job.data;
  const { strategyId, params } = normalizeStoredParams(job.data.params, job.data.strategy);
  const trackId = await startRun('backtest', job.id, symbol, job.data);
  try {
    const strat = getStrategy(strategyId);
    if (!strat) {
      throw new Error(`未知的回測策略：${strategyId}`);
    }
    await prisma.backtestRun.update({ where: { id: runId }, data: { status: 'running' } });

    const klines = await loadKlineRange(symbol, startDate, endDate);
    const minBars = strat.warmup(clampParams(strat, params)) + MIN_BARS_BUFFER;
    if (klines.length < minBars) {
      throw new Error(
        `歷史資料不足：${symbol} 於 ${startDate}~${endDate} 僅取得 ${klines.length} 筆日 K（${strat.label} 至少需 ${minBars} 筆）`,
      );
    }

    const result = runStrategyBacktest(klines, strategyId, params);
    const s = result.stats;
    // 策略與買進持有共用同一組日期（皆自 warmup 起），合併成單一序列供前端對照畫圖
    const mergedCurve = result.equityCurve.map((pt, i) => ({
      date: pt.date,
      equity: pt.equity,
      buyHold: result.buyHoldCurve[i]?.equity ?? null,
    }));
    await prisma.backtestRun.update({
      where: { id: runId },
      data: {
        status: 'done',
        strategy: strategyId,
        initialCapital: s.initialCapital,
        finalCapital: s.finalCapital,
        totalReturnPct: s.totalReturnPct,
        annualizedPct: s.annualizedPct,
        winRate: s.winRate,
        totalTrades: s.totalTrades,
        maxDrawdownPct: s.maxDrawdownPct,
        profitFactor: s.profitFactor,
        buyHoldPct: s.buyHoldPct,
        stats: s as object,
        equityCurve: mergedCurve as object,
        trades: result.trades as object,
        error: null,
      },
    });

    const summary = {
      runId,
      symbol,
      strategy: strategyId,
      totalTrades: s.totalTrades,
      winRate: Math.round(s.winRate),
      totalReturnPct: Math.round(s.totalReturnPct),
    };
    log.info('backtest job done', summary);
    await finishRun(trackId, summary);
    return summary;
  } catch (e) {
    const msg = (e as Error).message;
    await failRun(trackId, msg);
    // 盡力更新 BacktestRun 狀態，失敗也不掩蓋原始錯誤
    try {
      await prisma.backtestRun.update({
        where: { id: runId },
        data: { status: 'failed', error: msg },
      });
    } catch (updateErr) {
      log.error('backtest run 狀態更新失敗', { runId, error: (updateErr as Error).message });
    }
    throw e;
  }
}
