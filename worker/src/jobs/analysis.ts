/**
 * 分析 processor：抓 K 線 → 算指標 → 規則訊號 → 落庫 AnalysisSignal。
 * 全程不需 LLM（純資料 + TA），確保最小可用。
 */
import type { Job } from 'bullmq';
import type { AnalysisJobData } from '../queue/queues.js';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { log } from '../logger.js';
import { loadKline } from '../data/cache.js';
import { loadChips } from '../data/chips.js';
import { loadInstitutional } from '../data/institutional.js';
import { loadFundamentals, fetchPerHistory } from '../data/fundamentals.js';
import { loadValuationHistory } from '../data/valuation.js';
import { ensureStockName } from '../data/stockInfo.js';
import { computeChipSummary, computeInstitutionalSummary } from '../ta/chipSignals.js';
import { computeScoreDetail } from '../ta/score.js';
import { applyStrategy, valuationZone, type ValuationZoneLevel } from '@azeroth/common';
import { generateSignal, isStrongSignal } from '../ta/signals.js';
import { buildSignalCard } from '../line/push.js';
import { linePushQueue } from '../queue/queues.js';
import { runAlertChecks } from '../alerts.js';
import { startRun, finishRun, failRun } from '../run-tracker.js';
import type { TradeSignal } from '@azeroth/common';

/** 強訊號時，把訊號卡入列 line-push 推給 active 訂閱者。 */
async function maybePushStrongSignal(signal: TradeSignal, name?: string): Promise<number> {
  if (!isStrongSignal(signal, config.push.minConfidence)) return 0;
  const subs = await prisma.lineSubscriber.findMany({
    where: { isActive: true },
    select: { lineUserId: true },
  });
  if (!subs.length) return 0;
  await linePushQueue.add('push', {
    to: subs.map((s) => s.lineUserId),
    messages: [buildSignalCard(signal, name)],
  });
  return subs.length;
}

export async function processAnalysis(job: Job<AnalysisJobData>) {
  const { symbol } = job.data;
  const runId = await startRun('analysis', job.id, symbol, job.data);
  try {
    await ensureStockName(symbol).catch(() => {});
    const ohlcv = await loadKline(symbol, 120);
    if (!ohlcv.length) throw new Error(`無價格資料：${symbol}`);

    const signal = generateSignal(symbol, ohlcv);
    const tradeDate = new Date(`${signal.date}T00:00:00Z`);

    // 籌碼面：抓融資券 + 外資持股，落庫 StockChip
    let chipSummary: ReturnType<typeof computeChipSummary> | null = null;
    try {
      chipSummary = computeChipSummary(await loadChips(symbol, 30));
    } catch (e) {
      log.warn('籌碼抓取失敗', { symbol, error: (e as Error).message });
    }

    // 三大法人連買賣 streak + 集中度，落庫 StockInstitutional
    let instSummary: ReturnType<typeof computeInstitutionalSummary> | null = null;
    try {
      const inst = await loadInstitutional(symbol, 30);
      const vols = ohlcv.slice(-5).map((o) => o.volume);
      const avgVol5 = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
      instSummary = computeInstitutionalSummary(inst, avgVol5);
    } catch (e) {
      log.warn('法人籌碼抓取失敗', { symbol, error: (e as Error).message });
    }

    // 基本面 + 估值河流 + 多因子評分（落庫未加權 scoreDetail；score 欄位存綜合策略預設總分）
    let scoreDetail: ReturnType<typeof computeScoreDetail> | null = null;
    let scoreTotal: number | null = null;
    let valuationLevel: ValuationZoneLevel = 'unknown';
    try {
      // 與估值河流共用同一 TaiwanStockPER 回應，避免重複呼叫
      const perRows = await fetchPerHistory(symbol);
      const fundamental = await loadFundamentals(symbol, perRows);
      const valuationPoints = await loadValuationHistory(symbol, perRows);
      valuationLevel = valuationZone(
        valuationPoints.map((p) => p.per),
        'PER',
      ).zone;
      scoreDetail = computeScoreDetail({
        chipBias: chipSummary?.bias ?? 0,
        instBias: instSummary?.bias ?? 0,
        signal,
        fundamental,
        valuationZone: valuationLevel,
      });
      scoreTotal = applyStrategy(scoreDetail, 'balanced').total;
    } catch (e) {
      log.warn('基本面/評分失敗', { symbol, error: (e as Error).message });
    }

    const signalData = {
      action: signal.action,
      entryZone: signal.entryZone ?? null,
      stopLoss: signal.stopLoss ?? null,
      takeProfit: signal.takeProfit ?? null,
      timingNote: signal.timingNote ?? null,
      confidence: signal.confidence,
      rationale: signal.rationale,
      patterns: signal.patterns as object,
      indicators: signal.indicators as object,
      score: scoreTotal,
      scoreDetail: (scoreDetail as object) ?? undefined,
      institutionalStreak: instSummary?.streakDays ?? null,
      valuationZone: valuationLevel === 'unknown' ? null : valuationLevel,
    };
    await prisma.analysisSignal.upsert({
      where: { symbol_tradeDate: { symbol, tradeDate } },
      update: signalData,
      create: { symbol, tradeDate, ...signalData },
    });

    // 強訊號自動推播（缺 LINE 設定 / 無訂閱者則略過）
    let pushed = 0;
    try {
      pushed = await maybePushStrongSignal(signal);
    } catch (e) {
      log.warn('強訊號推播入列失敗', { symbol, error: (e as Error).message });
    }

    // 警報引擎：價格/RSI + 籌碼條件
    try {
      const lastClose = ohlcv[ohlcv.length - 1].close;
      const ind = signal.indicators;
      await runAlertChecks(symbol, {
        lastClose,
        rsi: ind.rsi14,
        marginChange5: chipSummary?.marginChange5 ?? null,
        foreignRatioChange5: chipSummary?.foreignRatioChange5 ?? null,
        adx: ind.dmi.adx,
        diPlus: ind.dmi.plusDi,
        diMinus: ind.dmi.minusDi,
        bias20: ind.bias.bias20,
        instStreakDays: instSummary?.streakDays ?? null,
        divBullish:
          ind.divergence.macdBullish || ind.divergence.rsiBullish || ind.divergence.volumeBullish,
        divBearish:
          ind.divergence.macdBearish || ind.divergence.rsiBearish || ind.divergence.volumeBearish,
        valuationZone: valuationLevel,
      });
    } catch (e) {
      log.warn('警報檢查失敗', { symbol, error: (e as Error).message });
    }

    log.info('analysis done', { symbol, action: signal.action, confidence: signal.confidence, pushedTo: pushed });
    await finishRun(runId, { action: signal.action, confidence: signal.confidence, pushedTo: pushed });
    return { symbol, action: signal.action, confidence: signal.confidence };
  } catch (e) {
    await failRun(runId, (e as Error).message);
    throw e;
  }
}
