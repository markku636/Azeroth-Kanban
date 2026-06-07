import { describe, expect, it } from 'vitest';
import type { StockOhlcv } from '../../stock-types';
import { rsiSeries } from '../indicators';
import { rsiStrategy } from './rsi';

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

const closes = Array.from({ length: 100 }, (_, i) => 100 + 18 * Math.sin(i / 7));
const klines = klinesFromCloses(closes);
const p = { period: 14, oversold: 30, overbought: 70 };

describe('rsiStrategy', () => {
  it('訊號與獨立計算的 RSI 門檻穿越一致', () => {
    const sig = rsiStrategy.generateSignals(klines, p);
    const rsi = rsiSeries(closes, p.period);
    for (let i = 1; i < closes.length; i++) {
      const cur = rsi[i];
      const prev = rsi[i - 1];
      let exp: 'buy' | 'sell' | null = null;
      if (cur !== null && prev !== null) {
        if (prev >= p.oversold && cur < p.oversold) {
          exp = 'buy';
        } else if (prev <= p.overbought && cur > p.overbought) {
          exp = 'sell';
        }
      }
      expect(sig[i]).toBe(exp);
    }
  });

  it('warmup 與 validate', () => {
    expect(rsiStrategy.warmup(p)).toBe(p.period);
    expect(rsiStrategy.validate({ period: 14, oversold: 70, overbought: 30 })).not.toBeNull();
    expect(rsiStrategy.validate(p)).toBeNull();
  });

  it('資料過短回全 null', () => {
    const short = klinesFromCloses(closes.slice(0, 10));
    expect(rsiStrategy.generateSignals(short, p).every((s) => s === null)).toBe(true);
  });
});
