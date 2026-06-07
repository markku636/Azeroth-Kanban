import { describe, expect, it } from 'vitest';
import type { StockOhlcv } from '../stock-types';
import { getStrategy, listStrategyIds, runStrategyBacktest } from './registry';

function dateStr(i: number): string {
  const d = new Date(Date.UTC(2020, 0, 1));
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
}

function sine(n: number): StockOhlcv[] {
  const out: StockOhlcv[] = [];
  let prev = 100;
  for (let i = 0; i < n; i++) {
    const close = 100 + 25 * Math.sin(i / 5);
    const open = prev;
    out.push({
      date: dateStr(i),
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: 1000,
    });
    prev = close;
  }
  return out;
}

describe('runStrategyBacktest — 五策略 smoke', () => {
  it('皆能執行、不丟例外、統計範圍合理', () => {
    const klines = sine(300);
    for (const id of listStrategyIds()) {
      const strat = getStrategy(id);
      expect(strat).toBeDefined();
      const r = runStrategyBacktest(klines, id, strat?.defaultParams ?? {});
      expect(r.equityCurve.length).toBeGreaterThan(0);
      expect(r.stats.winRate).toBeGreaterThanOrEqual(0);
      expect(r.stats.winRate).toBeLessThanOrEqual(100);
      expect(r.stats.maxDrawdownPct).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.stats.totalReturnPct)).toBe(true);
    }
  });

  it('未知策略丟例外', () => {
    expect(() => runStrategyBacktest(sine(50), 'nope', {})).toThrow();
  });

  it('資料過短回零交易、權益等於本金', () => {
    const r = runStrategyBacktest(sine(3), 'ma', getStrategy('ma')?.defaultParams ?? {});
    expect(r.trades.length).toBe(0);
    expect(r.stats.totalTrades).toBe(0);
  });
});

describe('比較公平性（startIndex 對齊）', () => {
  it('不同 warmup 策略以同 globalStart 起算 → 權益等長、共用同一買進持有', () => {
    const klines = sine(300);
    const ma = getStrategy('ma');
    const rsi = getStrategy('rsi');
    expect(ma && rsi).toBeTruthy();
    if (!ma || !rsi) {
      return;
    }
    const globalStart = Math.max(ma.warmup(ma.defaultParams), rsi.warmup(rsi.defaultParams));
    const rMa = runStrategyBacktest(klines, 'ma', ma.defaultParams, globalStart);
    const rRsi = runStrategyBacktest(klines, 'rsi', rsi.defaultParams, globalStart);
    expect(rMa.equityCurve.length).toBe(klines.length - globalStart);
    expect(rRsi.equityCurve.length).toBe(klines.length - globalStart);
    // 單一共用 buy-hold：兩者完全一致
    expect(rMa.buyHoldCurve.length).toBe(rRsi.buyHoldCurve.length);
    expect(rMa.stats.buyHoldPct).toBeCloseTo(rRsi.stats.buyHoldPct, 9);
    const lastMa = rMa.buyHoldCurve[rMa.buyHoldCurve.length - 1];
    const lastRsi = rRsi.buyHoldCurve[rRsi.buyHoldCurve.length - 1];
    expect(lastMa.equity).toBeCloseTo(lastRsi.equity, 6);
  });
});
