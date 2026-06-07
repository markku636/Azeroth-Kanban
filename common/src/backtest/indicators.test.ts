import { describe, expect, it } from 'vitest';
import { bollingerSeries, emaSeries, macdSeries, rsiSeries, smaSeries } from './indicators';

const closes = Array.from({ length: 80 }, (_, i) => 100 + 10 * Math.sin(i / 4) + i * 0.1);

describe('smaSeries', () => {
  it('等長、warmup 為 null、值正確', () => {
    const sma = smaSeries(closes, 5);
    expect(sma.length).toBe(closes.length);
    expect(sma[3]).toBeNull();
    const expected = (closes[0] + closes[1] + closes[2] + closes[3] + closes[4]) / 5;
    expect(sma[4]).toBeCloseTo(expected, 9);
  });

  it('資料過短回全 null', () => {
    expect(smaSeries([1, 2], 5).every((v) => v === null)).toBe(true);
  });
});

describe('emaSeries', () => {
  it('以 SMA 種子於 index period-1，後續遞迴正確', () => {
    const ema = emaSeries(closes, 5);
    expect(ema[3]).toBeNull();
    const seed = (closes[0] + closes[1] + closes[2] + closes[3] + closes[4]) / 5;
    expect(ema[4]).toBeCloseTo(seed, 9);
    const k = 2 / 6;
    expect(ema[5]).toBeCloseTo(closes[5] * k + seed * (1 - k), 9);
  });
});

describe('rsiSeries', () => {
  it('首值於 index=period，值落 0~100', () => {
    const rsi = rsiSeries(closes, 14);
    expect(rsi[13]).toBeNull();
    expect(rsi[14]).not.toBeNull();
    for (const v of rsi) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('全漲序列 RSI = 100（avgLoss 為 0）', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    const rsi = rsiSeries(up, 14);
    expect(rsi[14]).toBe(100);
  });
});

describe('macdSeries', () => {
  it('首個非 null 於 (slow-1)+(signal-1)，hist = macd − signal', () => {
    const m = macdSeries(closes, 12, 26, 9);
    const first = 26 - 1 + (9 - 1);
    expect(m[first - 1]).toBeNull();
    expect(m[first]).not.toBeNull();
    const pt = m[first];
    expect(pt).not.toBeNull();
    if (pt) {
      expect(pt.histogram).toBeCloseTo(pt.macd - pt.signal, 9);
    }
  });
});

describe('bollingerSeries', () => {
  it('warmup 為 null、upper ≥ middle ≥ lower', () => {
    const b = bollingerSeries(closes, 20, 2);
    expect(b[18]).toBeNull();
    const pt = b[19];
    expect(pt).not.toBeNull();
    if (pt) {
      expect(pt.upper).toBeGreaterThanOrEqual(pt.middle);
      expect(pt.middle).toBeGreaterThanOrEqual(pt.lower);
    }
  });
});
