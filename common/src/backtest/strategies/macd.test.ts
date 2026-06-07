import { describe, expect, it } from 'vitest';
import type { StockOhlcv } from '../../stock-types';
import { macdSeries } from '../indicators';
import { macdStrategy } from './macd';

function klinesFromCloses(closes: number[]): StockOhlcv[] {
  let prev = closes[0];
  return closes.map((c, i) => {
    const k: StockOhlcv = {
      date: String(i),
      open: prev,
      high: Math.max(prev, c) + 1,
      low: Math.min(prev, c) - 1,
      close: c,
      volume: 1000,
    };
    prev = c;
    return k;
  });
}

const closes = Array.from({ length: 120 }, (_, i) => 100 + 12 * Math.sin(i / 6) + i * 0.05);
const klines = klinesFromCloses(closes);
const p = { fast: 12, slow: 26, signal: 9 };

describe('macdStrategy', () => {
  it('訊號與獨立計算的柱狀體翻正/翻負一致', () => {
    const sig = macdStrategy.generateSignals(klines, p);
    const m = macdSeries(closes, p.fast, p.slow, p.signal);
    for (let i = 1; i < closes.length; i++) {
      const cur = m[i];
      const prev = m[i - 1];
      let exp: 'buy' | 'sell' | null = null;
      if (cur && prev) {
        if (prev.histogram <= 0 && cur.histogram > 0) {
          exp = 'buy';
        } else if (prev.histogram >= 0 && cur.histogram < 0) {
          exp = 'sell';
        }
      }
      expect(sig[i]).toBe(exp);
    }
  });

  it('warmup 與 validate', () => {
    expect(macdStrategy.warmup(p)).toBe(p.slow - 1 + (p.signal - 1));
    expect(macdStrategy.validate({ fast: 26, slow: 12, signal: 9 })).not.toBeNull();
    expect(macdStrategy.validate(p)).toBeNull();
  });

  it('資料過短回全 null', () => {
    const short = klinesFromCloses(closes.slice(0, 20));
    expect(macdStrategy.generateSignals(short, p).every((s) => s === null)).toBe(true);
  });
});
