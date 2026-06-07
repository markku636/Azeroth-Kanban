import { describe, expect, it } from 'vitest';
import type { StockOhlcv } from '../../stock-types';
import { smaSeries } from '../indicators';
import { maStrategy } from './ma-cross';

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

const closes = Array.from({ length: 90 }, (_, i) => 100 + 8 * Math.sin(i / 3) + 5 * Math.sin(i / 11));
const klines = klinesFromCloses(closes);
const p = { fastPeriod: 5, slowPeriod: 20 };

describe('maStrategy', () => {
  it('訊號與獨立計算的均線交叉一致', () => {
    const sig = maStrategy.generateSignals(klines, p);
    const fast = smaSeries(closes, p.fastPeriod);
    const slow = smaSeries(closes, p.slowPeriod);
    expect(sig.length).toBe(closes.length);
    for (let i = 1; i < closes.length; i++) {
      const f = fast[i];
      const s = slow[i];
      const pf = fast[i - 1];
      const ps = slow[i - 1];
      let exp: 'buy' | 'sell' | null = null;
      if (f !== null && s !== null && pf !== null && ps !== null) {
        if (pf <= ps && f > s) {
          exp = 'buy';
        } else if (pf >= ps && f < s) {
          exp = 'sell';
        }
      }
      expect(sig[i]).toBe(exp);
    }
  });

  it('暖身區（< slowPeriod-1）無訊號', () => {
    const sig = maStrategy.generateSignals(klines, p);
    for (let i = 0; i < p.slowPeriod - 1; i++) {
      expect(sig[i]).toBeNull();
    }
  });

  it('資料過短回全 null', () => {
    const short = klinesFromCloses(closes.slice(0, 10));
    expect(maStrategy.generateSignals(short, p).every((s) => s === null)).toBe(true);
  });

  it('warmup 與 validate', () => {
    expect(maStrategy.warmup(p)).toBe(p.slowPeriod - 1);
    expect(maStrategy.validate({ fastPeriod: 20, slowPeriod: 5 })).not.toBeNull();
    expect(maStrategy.validate(p)).toBeNull();
  });
});
