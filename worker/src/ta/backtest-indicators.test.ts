/**
 * Oracle 對拍測試：common 手刻指標 vs technicalindicators 套件。
 *
 * common 維持零依賴（不引入 technicalindicators），故正確性在 worker（已有該套件）對拍把關。
 * 使用固定合成序列（無網路），比較對齊後的非 null 區間。
 */
import { describe, expect, it } from 'vitest';
import { BollingerBands, EMA, MACD, RSI, SMA } from 'technicalindicators';
import {
  bollingerSeries,
  emaSeries,
  macdSeries,
  rsiSeries,
  smaSeries,
} from '@azeroth/common';

const closes = Array.from(
  { length: 200 },
  (_, i) => 100 + 20 * Math.sin(i / 9) + 8 * Math.sin(i / 4) + i * 0.05,
);

function compact<T>(arr: (T | null)[]): T[] {
  return arr.filter((v): v is T => v !== null);
}

describe('指標 oracle 對拍 technicalindicators', () => {
  it('SMA 完全吻合', () => {
    const mine = compact(smaSeries(closes, 20));
    const lib = SMA.calculate({ period: 20, values: closes });
    expect(mine.length).toBe(lib.length);
    for (let k = 0; k < lib.length; k++) {
      expect(mine[k]).toBeCloseTo(lib[k], 6);
    }
  });

  it('EMA（SMA 種子）完全吻合', () => {
    const mine = compact(emaSeries(closes, 20));
    const lib = EMA.calculate({ period: 20, values: closes });
    expect(mine.length).toBe(lib.length);
    for (let k = 0; k < lib.length; k++) {
      expect(mine[k]).toBeCloseTo(lib[k], 6);
    }
  });

  it('RSI（Wilder）對齊尾段吻合', () => {
    const mine = compact(rsiSeries(closes, 14));
    const lib = RSI.calculate({ period: 14, values: closes });
    const n = Math.min(mine.length, lib.length);
    // technicalindicators 的 RSI 輸出四捨五入至小數 2 位（如 27.69），我方為精確值（27.6907），
    // 故以 tol 2（< 0.005）對拍，足以驗證 Wilder 平滑公式正確。
    for (let k = 1; k <= n; k++) {
      expect(mine[mine.length - k]).toBeCloseTo(lib[lib.length - k], 2);
    }
  });

  it('MACD 柱狀體對齊尾段吻合', () => {
    const mine = compact(macdSeries(closes, 12, 26, 9));
    const lib = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    }).filter((x) => x.histogram !== undefined);
    const n = Math.min(mine.length, lib.length);
    for (let k = 1; k <= n; k++) {
      expect(mine[mine.length - k].histogram).toBeCloseTo(lib[lib.length - k].histogram as number, 4);
    }
  });

  it('Bollinger 中軌/上軌對齊尾段吻合', () => {
    const mine = compact(bollingerSeries(closes, 20, 2));
    const lib = BollingerBands.calculate({ period: 20, values: closes, stdDev: 2 });
    const n = Math.min(mine.length, lib.length);
    for (let k = 1; k <= n; k++) {
      expect(mine[mine.length - k].middle).toBeCloseTo(lib[lib.length - k].middle, 6);
      expect(mine[mine.length - k].upper).toBeCloseTo(lib[lib.length - k].upper, 4);
    }
  });
});
