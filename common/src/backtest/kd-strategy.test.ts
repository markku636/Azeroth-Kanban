import { describe, expect, it } from 'vitest';
import type { StockOhlcv } from '../stock-types';
import { runKdBacktest, stochasticSeries } from './kd-strategy';
import { DEFAULT_BACKTEST_PARAMS } from './types';

/** 由起始日推算第 i 天的 YYYY-MM-DD（連續日，週末不影響回測序列）。 */
function dateStr(i: number): string {
  const d = new Date(Date.UTC(2020, 0, 1));
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
}

/** 產生正弦波 K 線：自然產生 KD 在低檔/高檔的黃金/死亡交叉。 */
function sineKlines(n: number): StockOhlcv[] {
  return pricedSineKlines(n, 100, 25);
}

/** 指定基準價/振幅的正弦波 K 線（測高價股用）。 */
function pricedSineKlines(n: number, base: number, amp: number): StockOhlcv[] {
  const out: StockOhlcv[] = [];
  let prevClose = base;
  for (let i = 0; i < n; i++) {
    const close = base + amp * Math.sin(i / 5);
    const open = prevClose;
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 1;
    out.push({ date: dateStr(i), open, high, low, close, volume: 1000 });
    prevClose = close;
  }
  return out;
}

describe('stochasticSeries', () => {
  it('warmup 期為 null，之後 k/d 落在 0~100', () => {
    const klines = sineKlines(60);
    const kd = stochasticSeries(klines, 9, 3);
    expect(kd.length).toBe(klines.length);
    const firstValid = 9 - 1 + (3 - 1);
    expect(kd[firstValid - 1]).toBeNull();
    expect(kd[firstValid]).not.toBeNull();
    for (const pt of kd) {
      if (pt) {
        expect(pt.k).toBeGreaterThanOrEqual(0);
        expect(pt.k).toBeLessThanOrEqual(100);
        expect(pt.d).toBeGreaterThanOrEqual(0);
        expect(pt.d).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('runKdBacktest', () => {
  it('正弦波會產生交易，且權益曲線與 K 線同長度（自 warmup 起）', () => {
    const klines = sineKlines(150);
    const result = runKdBacktest(klines);
    expect(result.trades.length).toBeGreaterThan(0);
    const firstValid = DEFAULT_BACKTEST_PARAMS.kdPeriod - 1 + (DEFAULT_BACKTEST_PARAMS.kdSignal - 1);
    expect(result.equityCurve.length).toBe(klines.length - firstValid);
    expect(result.buyHoldCurve.length).toBe(klines.length - firstValid);
  });

  it('無未來函數：進場日為黃金交叉訊號日的「下一」交易日，且以開盤價成交', () => {
    const klines = sineKlines(150);
    const p = DEFAULT_BACKTEST_PARAMS;
    const kd = stochasticSeries(klines, p.kdPeriod, p.kdSignal);
    // 找出第一個會觸發買進的黃金交叉 index
    let signalIdx = -1;
    for (let i = 1; i < klines.length; i++) {
      const cur = kd[i];
      const prev = kd[i - 1];
      if (cur && prev && prev.k <= prev.d && cur.k > cur.d && cur.k < p.buyBelow) {
        signalIdx = i;
        break;
      }
    }
    expect(signalIdx).toBeGreaterThan(0);
    const firstTrade = runKdBacktest(klines).trades[0];
    expect(firstTrade.entryDate).toBe(klines[signalIdx + 1].date);
    expect(firstTrade.entryPrice).toBe(klines[signalIdx + 1].open);
  });

  it('交易明細的淨損益 = 毛損益 − 手續費 − 證交稅', () => {
    const result = runKdBacktest(sineKlines(150));
    for (const t of result.trades) {
      expect(t.netPnl).toBeCloseTo(t.grossPnl - t.fee - t.tax, 4);
      expect(t.shares).toBeGreaterThan(0); // 零股：不限定整張
    }
  });

  it('高價股（每股 ~1000）以本金 100 萬仍能進場（零股，非整張制）', () => {
    // 模擬台積電等高價股：價位遠高於「本金 / 1000」，整張制會買 0 張、零股制可買數百股
    const klines = pricedSineKlines(150, 1000, 250);
    const result = runKdBacktest(klines, { initialCapital: 1_000_000 });
    expect(result.trades.length).toBeGreaterThan(0);
    const first = result.trades[0];
    expect(first.shares).toBeGreaterThan(1); // 確實買進數百股而非 0
    expect(first.shares % 1000).not.toBe(0); // 零股（非整張）
    // 買進持有也應有非零報酬（不再因買不起 1 張而為 0）
    expect(result.stats.buyHoldPct).not.toBe(0);
  });

  it('計入費用後最終資金不高於零成本版本（費用拖累報酬）', () => {
    const klines = sineKlines(150);
    const withCost = runKdBacktest(klines, { feeRate: 0.001425, taxRate: 0.003 });
    const noCost = runKdBacktest(klines, { feeRate: 0, taxRate: 0 });
    expect(withCost.trades.length).toBeGreaterThan(0);
    expect(withCost.stats.finalCapital).toBeLessThanOrEqual(noCost.stats.finalCapital + 1e-6);
  });

  it('停損出場價不高於停損價（含跳空以開盤成交）', () => {
    const result = runKdBacktest(sineKlines(200), { stopLossPct: 5 });
    const slTrades = result.trades.filter((t) => t.exitReason === 'stop_loss');
    for (const t of slTrades) {
      expect(t.exitPrice).toBeLessThanOrEqual(t.entryPrice * 0.95 + 1e-9);
    }
  });

  it('統計指標範圍合理（勝率 0~100、最大回撤 0~100）', () => {
    const { stats } = runKdBacktest(sineKlines(300));
    expect(stats.winRate).toBeGreaterThanOrEqual(0);
    expect(stats.winRate).toBeLessThanOrEqual(100);
    expect(stats.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(stats.maxDrawdownPct).toBeLessThanOrEqual(100);
    expect(stats.winTrades + stats.lossTrades).toBe(stats.totalTrades);
    expect(Number.isFinite(stats.totalReturnPct)).toBe(true);
  });

  it('資料過短時回傳零交易、權益等於本金', () => {
    const result = runKdBacktest(sineKlines(5));
    expect(result.trades.length).toBe(0);
    expect(result.stats.totalTrades).toBe(0);
    expect(result.stats.finalCapital).toBe(DEFAULT_BACKTEST_PARAMS.initialCapital);
  });
});
