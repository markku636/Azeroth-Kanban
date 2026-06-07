/**
 * 通用回測引擎（純函式，無副作用、無外部依賴）。
 *
 * 由原 KD 回測迴圈逐字抽出，交易/結算/統計邏輯與策略無關，僅「買/賣訊號」由各策略提供。
 *
 * 不變式：
 * - 避免未來函數：訊號於第 i 日「收盤」確認（signals[i]），第 i+1 日「開盤價」成交；
 *   停損 / 停利則於觸價當日盤中成交。
 * - 部位為「長倉、單一持倉、零股全壓」；多空對稱（放空）為未來擴充，目前不支援。
 * - startIndex 覆寫交易/權益/買進持有的起算點（比較頁公平對齊用）；指標仍由策略以全歷史暖身，
 *   起算點之前的訊號一律忽略。
 */
import type { StockOhlcv } from '../stock-types';
import {
  type BacktestEquityPoint,
  type BacktestExitReason,
  type BacktestResult,
  type BacktestStats,
  type BacktestTrade,
  type CommonBacktestParams,
  type DaySignal,
} from './types';

/** 一年交易日數（年化用）。 */
const TRADING_DAYS_PER_YEAR = 252;

interface OpenPosition {
  entryDate: string;
  entryPrice: number;
  shares: number;
  /** 進場手續費（平倉時併入交易明細） */
  buyFee: number;
}

/** 兩個 YYYY-MM-DD 的日曆天數差。 */
function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((db - da) / 86_400_000));
}

/**
 * 執行回測：依 signals 在 klines 上模擬交易。
 * @param klines 升冪日 K
 * @param signals 與 klines 等長，signals[i] = 第 i 日收盤確認的訊號（buy/sell/null）
 * @param warmup 策略暖身根數（無 startIndex 時的起算點）
 * @param p 共用參數
 * @param startIndex 起算點覆寫（>= warmup；比較頁對齊用）
 */
export function runBacktest(
  klines: StockOhlcv[],
  signals: (DaySignal | null)[],
  warmup: number,
  p: CommonBacktestParams,
  startIndex?: number,
): BacktestResult {
  const start = startIndex !== undefined ? startIndex : warmup;

  const trades: BacktestTrade[] = [];
  const equityCurve: BacktestEquityPoint[] = [];
  let capital = p.initialCapital;
  let position: OpenPosition | null = null;
  let pendingBuy = false;
  let pendingSell = false;

  const closeAt = (price: number, date: string, reason: BacktestExitReason): void => {
    if (!position) {
      return;
    }
    const proceeds = price * position.shares;
    const sellFee = proceeds * p.feeRate;
    const tax = proceeds * p.taxRate;
    capital += proceeds - sellFee - tax;
    const cost = position.entryPrice * position.shares;
    const grossPnl = proceeds - cost;
    const fee = position.buyFee + sellFee;
    const netPnl = grossPnl - fee - tax;
    trades.push({
      entryDate: position.entryDate,
      entryPrice: position.entryPrice,
      exitDate: date,
      exitPrice: price,
      shares: position.shares,
      grossPnl,
      fee,
      tax,
      netPnl,
      netPnlPct: (netPnl / (cost + position.buyFee)) * 100,
      holdingDays: daysBetween(position.entryDate, date),
      exitReason: reason,
    });
    position = null;
  };

  for (let i = start; i < klines.length; i++) {
    const day = klines[i];

    // 1) 依昨日收盤訊號，於今日開盤成交
    if (!position && pendingBuy) {
      // 零股：以本金可買的最大股數買進（預留手續費，全額投入），消除整張制對高價股的扭曲
      const shares = Math.floor(capital / (day.open * (1 + p.feeRate)));
      if (shares >= 1) {
        const buyFee = day.open * shares * p.feeRate;
        capital -= day.open * shares + buyFee;
        position = { entryDate: day.date, entryPrice: day.open, shares, buyFee };
      }
    } else if (position && pendingSell) {
      closeAt(day.open, day.date, 'signal');
    }
    pendingBuy = false;
    pendingSell = false;

    // 2) 盤中停損 / 停利（保守：同日皆觸發時以停損優先）
    if (position && (p.stopLossPct > 0 || p.takeProfitPct > 0)) {
      const slPrice = position.entryPrice * (1 - p.stopLossPct / 100);
      const tpPrice = position.entryPrice * (1 + p.takeProfitPct / 100);
      if (p.stopLossPct > 0 && day.low <= slPrice) {
        // 跳空開低則以開盤價成交（更差）
        closeAt(Math.min(slPrice, day.open), day.date, 'stop_loss');
      } else if (p.takeProfitPct > 0 && day.high >= tpPrice) {
        // 跳空開高則以開盤價成交
        closeAt(Math.max(tpPrice, day.open), day.date, 'take_profit');
      }
    }

    // 3) 今日收盤訊號 → 設定明日待成交（買訊僅在空手、賣訊僅在持倉時生效）
    const sig = signals[i];
    if (!position && sig === 'buy') {
      pendingBuy = true;
    } else if (position && sig === 'sell') {
      pendingSell = true;
    }

    // 4) 收盤市值結算權益曲線
    const equity = capital + (position ? position.shares * day.close : 0);
    equityCurve.push({ date: day.date, equity });
  }

  // 期末仍持倉 → 以最後一日收盤平倉
  const lastIdx = klines.length - 1;
  if (position && lastIdx >= start) {
    closeAt(klines[lastIdx].close, klines[lastIdx].date, 'end');
    equityCurve[equityCurve.length - 1] = { date: klines[lastIdx].date, equity: capital };
  }

  const buyHoldCurve = buildBuyHoldCurve(klines, start, p);
  const stats = computeStats(trades, equityCurve, buyHoldCurve, p);
  return { stats, trades, equityCurve, buyHoldCurve };
}

/** 買進持有 benchmark：start 日開盤買滿、期末收盤賣出，含一次買賣費用。 */
export function buildBuyHoldCurve(
  klines: StockOhlcv[],
  start: number,
  p: CommonBacktestParams,
): BacktestEquityPoint[] {
  const curve: BacktestEquityPoint[] = [];
  if (start >= klines.length) {
    return curve;
  }
  const entry = klines[start].open;
  // 零股：期初以本金幾乎全額買進（預留手續費），benchmark 才不被整張閒置現金低估
  const shares = Math.floor(p.initialCapital / (entry * (1 + p.feeRate)));
  const buyFee = entry * shares * p.feeRate;
  const cash = p.initialCapital - entry * shares - buyFee;
  for (let i = start; i < klines.length; i++) {
    curve.push({ date: klines[i].date, equity: cash + shares * klines[i].close });
  }
  // 期末以收盤賣出扣費後的現金作為最終權益
  if (shares > 0 && curve.length > 0) {
    const exit = klines[klines.length - 1].close;
    const proceeds = exit * shares;
    const final = cash + proceeds - proceeds * p.feeRate - proceeds * p.taxRate;
    curve[curve.length - 1] = { date: klines[klines.length - 1].date, equity: final };
  }
  return curve;
}

/** 標準差（樣本）。 */
function stddev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** 由權益曲線算最大回撤 %。 */
function maxDrawdownPct(curve: BacktestEquityPoint[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const pt of curve) {
    if (pt.equity > peak) {
      peak = pt.equity;
    }
    if (peak > 0) {
      const dd = ((peak - pt.equity) / peak) * 100;
      if (dd > maxDd) {
        maxDd = dd;
      }
    }
  }
  return maxDd;
}

/** 計算回測統計摘要。 */
export function computeStats(
  trades: BacktestTrade[],
  equityCurve: BacktestEquityPoint[],
  buyHoldCurve: BacktestEquityPoint[],
  p: CommonBacktestParams,
): BacktestStats {
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl <= 0);
  const sumWin = wins.reduce((a, t) => a + t.netPnl, 0);
  const sumLoss = losses.reduce((a, t) => a + t.netPnl, 0); // 負值

  const finalCapital = equityCurve.length
    ? equityCurve[equityCurve.length - 1].equity
    : p.initialCapital;
  const totalReturnPct = ((finalCapital - p.initialCapital) / p.initialCapital) * 100;

  const startDate = equityCurve[0]?.date ?? '';
  const endDate = equityCurve[equityCurve.length - 1]?.date ?? '';
  const years = startDate && endDate ? Math.max(daysBetween(startDate, endDate) / 365.25, 0) : 0;
  const annualizedPct =
    years > 0 && finalCapital > 0
      ? ((finalCapital / p.initialCapital) ** (1 / years) - 1) * 100
      : 0;

  // 每日權益報酬 → 年化波動
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) {
      dailyReturns.push(equityCurve[i].equity / prev - 1);
    }
  }
  const volatilityPct = stddev(dailyReturns) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;

  const buyHoldFinal = buyHoldCurve.length
    ? buyHoldCurve[buyHoldCurve.length - 1].equity
    : p.initialCapital;
  const buyHoldPct = ((buyHoldFinal - p.initialCapital) / p.initialCapital) * 100;

  return {
    totalTrades: trades.length,
    winTrades: wins.length,
    lossTrades: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    avgWin: wins.length ? sumWin / wins.length : 0,
    avgLoss: losses.length ? sumLoss / losses.length : 0,
    profitFactor: sumLoss < 0 ? sumWin / Math.abs(sumLoss) : null,
    maxWin: trades.length ? Math.max(...trades.map((t) => t.netPnl)) : 0,
    maxLoss: trades.length ? Math.min(...trades.map((t) => t.netPnl)) : 0,
    avgHoldingDays: trades.length
      ? trades.reduce((a, t) => a + t.holdingDays, 0) / trades.length
      : 0,
    initialCapital: p.initialCapital,
    finalCapital,
    totalReturnPct,
    annualizedPct,
    maxDrawdownPct: maxDrawdownPct(equityCurve),
    volatilityPct,
    sharpe: volatilityPct > 0 ? annualizedPct / volatilityPct : null,
    buyHoldPct,
    startDate,
    endDate,
    tradingDays: equityCurve.length,
    years,
  };
}
