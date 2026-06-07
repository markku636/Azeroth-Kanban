import { describe, expect, it } from 'vitest';
import type { StockOhlcv } from '../../stock-types';
import { stochasticSeries } from '../indicators';
import { kdStrategy } from './kd';

function sine(n: number): StockOhlcv[] {
  const out: StockOhlcv[] = [];
  let prev = 100;
  for (let i = 0; i < n; i++) {
    const close = 100 + 25 * Math.sin(i / 5);
    const open = prev;
    out.push({
      date: String(i),
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

const klines = sine(150);
const p = { kdPeriod: 9, kdSignal: 3, buyBelow: 40, sellAbove: 60 };

describe('kdStrategy', () => {
  it('訊號與獨立計算的低檔黃金/高檔死亡交叉一致', () => {
    const sig = kdStrategy.generateSignals(klines, p);
    const kd = stochasticSeries(klines, p.kdPeriod, p.kdSignal);
    for (let i = 1; i < klines.length; i++) {
      const cur = kd[i];
      const prev = kd[i - 1];
      let exp: 'buy' | 'sell' | null = null;
      if (cur && prev) {
        if (prev.k <= prev.d && cur.k > cur.d && cur.k < p.buyBelow) {
          exp = 'buy';
        } else if (prev.k >= prev.d && cur.k < cur.d && cur.k > p.sellAbove) {
          exp = 'sell';
        }
      }
      expect(sig[i]).toBe(exp);
    }
  });

  it('warmup = kdPeriod-1+(kdSignal-1)，validate 檢查門檻', () => {
    expect(kdStrategy.warmup(p)).toBe(p.kdPeriod - 1 + (p.kdSignal - 1));
    expect(kdStrategy.validate({ ...p, buyBelow: 70, sellAbove: 40 })).not.toBeNull();
    expect(kdStrategy.validate(p)).toBeNull();
  });
});
