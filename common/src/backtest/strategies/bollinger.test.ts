import { describe, expect, it } from 'vitest';
import type { StockOhlcv } from '../../stock-types';
import { bollingerSeries } from '../indicators';
import { bollingerStrategy } from './bollinger';

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

const closes = Array.from({ length: 100 }, (_, i) => 100 + 15 * Math.sin(i / 5) + 6 * Math.sin(i / 13));
const klines = klinesFromCloses(closes);
const p = { period: 20, stdDev: 2 };

describe('bollingerStrategy', () => {
  it('訊號與獨立計算的突破上軌/跌破中軌一致', () => {
    const sig = bollingerStrategy.generateSignals(klines, p);
    const bb = bollingerSeries(closes, p.period, p.stdDev);
    for (let i = 1; i < closes.length; i++) {
      const cur = bb[i];
      const prev = bb[i - 1];
      let exp: 'buy' | 'sell' | null = null;
      if (cur && prev) {
        if (closes[i - 1] <= prev.upper && closes[i] > cur.upper) {
          exp = 'buy';
        } else if (closes[i - 1] >= prev.middle && closes[i] < cur.middle) {
          exp = 'sell';
        }
      }
      expect(sig[i]).toBe(exp);
    }
  });

  it('warmup 與 validate', () => {
    expect(bollingerStrategy.warmup(p)).toBe(p.period - 1);
    expect(bollingerStrategy.validate({ period: 20, stdDev: 0 })).not.toBeNull();
    expect(bollingerStrategy.validate(p)).toBeNull();
  });

  it('資料過短回全 null', () => {
    const short = klinesFromCloses(closes.slice(0, 10));
    expect(bollingerStrategy.generateSignals(short, p).every((s) => s === null)).toBe(true);
  });
});
