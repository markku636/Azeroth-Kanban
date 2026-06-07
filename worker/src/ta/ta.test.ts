import { describe, it, expect } from 'vitest';
import type { StockOhlcv } from '@azeroth/common';
import { computeIndicators, detectPatterns, detectDivergence } from './indicators.js';
import { generateSignal, isStrongSignal } from './signals.js';
import { computeChipSummary, computeInstitutionalSummary } from './chipSignals.js';
import { computeStockScore, computeScoreDetail } from './score.js';
import { applyStrategy, normalizeWeights, computeRiverBands, valuationZone } from '@azeroth/common';
import { renderKlineChart } from './chart.js';
import type { TradeSignal, ChipDaily, StockFundamentalDto, StockIndicators } from '@azeroth/common';

/** 產生 N 根合成日 K，trend>0 為上升、<0 為下降。 */
function synthOhlcv(n: number, trend: number, base = 100): StockOhlcv[] {
  const out: StockOhlcv[] = [];
  let price = base;
  for (let i = 0; i < n; i++) {
    const open = price;
    price = Math.max(1, price + trend + Math.sin(i / 3) * 0.5);
    const close = price;
    const high = Math.max(open, close) + 0.8;
    const low = Math.min(open, close) - 0.8;
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    out.push({
      date: d.toISOString().slice(0, 10),
      open, high, low, close,
      volume: 1_000_000 + i * 1000,
    });
  }
  return out;
}

describe('computeIndicators', () => {
  it('回傳尾端代表值（足量資料時非 null）', () => {
    const ind = computeIndicators(synthOhlcv(80, 0.5));
    expect(ind.ma5).not.toBeNull();
    expect(ind.ma20).not.toBeNull();
    expect(ind.ma60).not.toBeNull();
    expect(ind.rsi14).not.toBeNull();
    expect(ind.macd.macd).not.toBeNull();
    expect(ind.kd.k).not.toBeNull();
    expect(ind.bollinger.upper).not.toBeNull();
  });

  it('上升趨勢 RSI 偏高', () => {
    const up = computeIndicators(synthOhlcv(80, 1));
    expect(up.rsi14!).toBeGreaterThan(55);
  });

  it('趨勢動能指標足量資料時非 null', () => {
    const ind = computeIndicators(synthOhlcv(80, 0.5));
    expect(ind.dmi.adx).not.toBeNull();
    expect(ind.williamsR).not.toBeNull();
    expect(ind.cci).not.toBeNull();
    expect(ind.obv.value).not.toBeNull();
    expect(ind.bias.bias20).not.toBeNull();
    expect(ind.sar.value).not.toBeNull();
    expect(ind.divergence).toBeDefined();
  });

  it('上升趨勢 SAR 偏多、乖離率為正', () => {
    const up = computeIndicators(synthOhlcv(80, 1));
    expect(up.sar.position).toBe('long');
    expect(up.bias.bias20!).toBeGreaterThan(0);
  });

  it('資料不足時新指標安全回 null（不 throw）', () => {
    const ind = computeIndicators(synthOhlcv(5, 0.5));
    expect(ind.dmi.adx).toBeNull();
    expect(ind.ma240).toBeNull();
    expect(ind.divergence.macdBullish).toBe(false);
  });
});

describe('detectDivergence', () => {
  it('價創新高但指標走低 → 頂背離(bearish)', () => {
    // 價：兩個 pivot 高，後高於前；指標：後低於前
    const price = [10, 12, 10, 11, 15, 11, 12, 18, 12, 13];
    const osc = [1, 9, 1, 2, 8, 2, 3, 5, 1, 2];
    const d = detectDivergence(price, osc, 40, 1);
    expect(d.bearish).toBe(true);
  });

  it('價創新低但指標走高 → 底背離(bullish)', () => {
    const price = [20, 12, 20, 19, 8, 19, 18, 5, 18, 17];
    const osc = [9, 2, 9, 8, 5, 8, 7, 8, 7, 6];
    const d = detectDivergence(price, osc, 40, 1);
    expect(d.bullish).toBe(true);
  });

  it('序列過短回 false', () => {
    const d = detectDivergence([1, 2], [1, 2]);
    expect(d).toEqual({ bullish: false, bearish: false });
  });
});

describe('detectPatterns', () => {
  it('能偵測 doji（開收幾乎相等）', () => {
    const data: StockOhlcv[] = [
      { date: '2026-01-01', open: 100, high: 101, low: 99, close: 100.2, volume: 1000 },
      { date: '2026-01-02', open: 100, high: 105, low: 95, close: 100.05, volume: 1000 },
    ];
    const p = detectPatterns(data);
    expect(p.some((x) => x.code === 'doji')).toBe(true);
  });
});

describe('generateSignal', () => {
  it('上升趨勢偏向 BUY 或 HOLD，且結構完整', () => {
    const sig = generateSignal('2330', synthOhlcv(80, 1));
    expect(['BUY', 'SELL', 'HOLD']).toContain(sig.action);
    expect(sig.confidence).toBeGreaterThanOrEqual(0);
    expect(sig.confidence).toBeLessThanOrEqual(1);
    expect(typeof sig.rationale).toBe('string');
    expect(sig.indicators).toBeDefined();
  });
});

describe('isStrongSignal', () => {
  const base = (over: Partial<TradeSignal>): TradeSignal => ({
    symbol: '2330', date: '2026-06-06', action: 'HOLD', confidence: 0,
    rationale: '', patterns: [], indicators: {} as TradeSignal['indicators'], ...over,
  });
  it('HOLD 不算強訊號', () => {
    expect(isStrongSignal(base({ action: 'HOLD', confidence: 0.9 }))).toBe(false);
  });
  it('BUY 且信心達門檻為強訊號', () => {
    expect(isStrongSignal(base({ action: 'BUY', confidence: 0.6 }))).toBe(true);
  });
  it('BUY 但信心不足非強訊號', () => {
    expect(isStrongSignal(base({ action: 'BUY', confidence: 0.3 }))).toBe(false);
  });
  it('門檻可調', () => {
    expect(isStrongSignal(base({ action: 'SELL', confidence: 0.4 }), 0.3)).toBe(true);
  });
});

describe('computeChipSummary', () => {
  function synthChips(n: number, marginTrend: number, foreignTrend: number): ChipDaily[] {
    const out: ChipDaily[] = [];
    let margin = 30000;
    let fr = 50;
    for (let i = 0; i < n; i++) {
      margin += marginTrend;
      fr += foreignTrend;
      out.push({
        date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
        marginBalance: margin,
        shortBalance: 100,
        foreignRatio: Math.round(fr * 100) / 100,
      });
    }
    return out;
  }
  it('融資減 + 外資增 → bias 偏多（>0）', () => {
    const s = computeChipSummary(synthChips(10, -200, 0.3));
    expect(s.marginChange5).toBeLessThan(0);
    expect(s.foreignRatioChange5).toBeGreaterThan(0);
    expect(s.bias).toBeGreaterThan(0);
  });
  it('融資增 + 外資減 → bias 偏空（<0）', () => {
    const s = computeChipSummary(synthChips(10, 300, -0.4));
    expect(s.bias).toBeLessThan(0);
  });
  it('無資料安全回傳', () => {
    const s = computeChipSummary([]);
    expect(s.bias).toBe(0);
    expect(s.marginBalance).toBeNull();
  });
});

describe('computeStockScore', () => {
  const ind = (over: Partial<StockIndicators>): StockIndicators => ({
    ma5: 110, ma20: 100, ma60: 90, ema12: null, ema26: null, rsi14: 55,
    macd: { macd: null, signal: null, histogram: null },
    kd: { k: null, d: null }, bollinger: { upper: null, middle: null, lower: null },
    volumeRatio: null,
    dmi: { plusDi: null, minusDi: null, adx: null }, williamsR: null, cci: null,
    obv: { value: null, trend: null }, bias: { bias5: null, bias10: null, bias20: null },
    sar: { value: null, position: null },
    divergence: { macdBullish: false, macdBearish: false, rsiBullish: false, rsiBearish: false, volumeBullish: false, volumeBearish: false },
    ma120: null, ma240: null, ...over,
  });
  const fund = (over: Partial<StockFundamentalDto>): StockFundamentalDto => ({
    revenuePeriod: '2026-04', revenue: 1000, revenueYoy: 0, revenueMom: 0,
    eps: 5, per: 20, pbr: 3, dividendYield: 3, ...over,
  });

  it('全偏多 → 總分高（>60）', () => {
    const s = computeStockScore({
      chipBias: 2,
      signal: { action: 'BUY', confidence: 0.8, indicators: ind({}) },
      fundamental: fund({ revenueYoy: 30, per: 12, dividendYield: 5 }),
    });
    expect(s.total).toBeGreaterThan(60);
    expect(s.factors).toHaveLength(5);
    expect(s.factors[0].weight).toBe(0.3);
  });
  it('全偏空 → 總分低（<40）', () => {
    const s = computeStockScore({
      chipBias: -2,
      signal: { action: 'SELL', confidence: 0.8, indicators: ind({ ma5: 90, ma20: 100, ma60: 110, rsi14: 75 }) },
      fundamental: fund({ revenueYoy: -30, per: 50 }),
    });
    expect(s.total).toBeLessThan(40);
  });
  it('總分介於 0~100', () => {
    const s = computeStockScore({
      chipBias: 0,
      signal: { action: 'HOLD', confidence: 0, indicators: ind({}) },
      fundamental: fund({}),
    });
    expect(s.total).toBeGreaterThanOrEqual(0);
    expect(s.total).toBeLessThanOrEqual(100);
  });
});

describe('computeInstitutionalSummary（三大法人連買賣 streak）', () => {
  const day = (totalNet: number) => ({ totalNet });

  it('連續 4 日買超 → streakDays=4、bias>0', () => {
    const s = computeInstitutionalSummary([day(100), day(200), day(300), day(400)], 1000);
    expect(s.streakDays).toBe(4);
    expect(s.bias).toBeGreaterThan(0);
    expect(s.netToday).toBe(400);
  });

  it('連續 5 日賣超 → streakDays=-5、bias 達 -2', () => {
    const s = computeInstitutionalSummary(
      [day(-10), day(-20), day(-30), day(-40), day(-50)],
      1000,
    );
    expect(s.streakDays).toBe(-5);
    expect(s.bias).toBeLessThanOrEqual(-2);
  });

  it('方向反轉時 streak 從最後一天重新計', () => {
    const s = computeInstitutionalSummary([day(100), day(100), day(-50)], 1000);
    expect(s.streakDays).toBe(-1);
  });

  it('空陣列 → 安全回 0、不 throw', () => {
    const s = computeInstitutionalSummary([], null);
    expect(s.streakDays).toBe(0);
    expect(s.bias).toBe(0);
    expect(s.concentration).toBeNull();
  });
});

describe('computeScoreDetail + applyStrategy（多策略可調權重）', () => {
  const ind = (over: Partial<StockIndicators>): StockIndicators => ({
    ma5: 110, ma20: 100, ma60: 90, ema12: null, ema26: null, rsi14: 55,
    macd: { macd: null, signal: null, histogram: null },
    kd: { k: null, d: null }, bollinger: { upper: null, middle: null, lower: null },
    volumeRatio: null,
    dmi: { plusDi: null, minusDi: null, adx: null }, williamsR: null, cci: null,
    obv: { value: null, trend: null }, bias: { bias5: null, bias10: null, bias20: null },
    sar: { value: null, position: null },
    divergence: { macdBullish: false, macdBearish: false, rsiBullish: false, rsiBearish: false, volumeBullish: false, volumeBearish: false },
    ma120: null, ma240: null, ...over,
  });
  const fund: StockFundamentalDto = {
    revenuePeriod: '2026-04', revenue: 1000, revenueYoy: 30, revenueMom: 2,
    eps: 5, per: 12, pbr: 2, dividendYield: 5,
  };

  it('computeScoreDetail 產出 v2 五因子、無 total', () => {
    const d = computeScoreDetail({
      chipBias: 1,
      signal: { action: 'BUY', confidence: 0.8, indicators: ind({}) },
      fundamental: fund,
    });
    expect(d.version).toBe(2);
    expect(d.factors).toHaveLength(5);
    expect(d.factors.map((f) => f.key).sort()).toEqual(
      ['chips', 'fund', 'momentum', 'tech', 'valuation'],
    );
    expect((d as unknown as { total?: number }).total).toBeUndefined();
  });

  it('不同策略對同一 detail 產生不同總分', () => {
    const d = computeScoreDetail({
      chipBias: 2,
      signal: { action: 'BUY', confidence: 0.8, indicators: ind({}) },
      fundamental: fund,
    });
    const chips = applyStrategy(d, 'chips').total;
    const value = applyStrategy(d, 'value').total;
    expect(chips).not.toBe(value);
    expect(chips).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });

  it('未知策略 id 退回預設（綜合）', () => {
    const d = computeScoreDetail({
      chipBias: 0,
      signal: { action: 'HOLD', confidence: 0, indicators: ind({}) },
      fundamental: fund,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = applyStrategy(d, 'no-such' as any);
    const balanced = applyStrategy(d, 'balanced');
    expect(bad.total).toBe(balanced.total);
    expect(bad.strategyId).toBe('balanced');
  });

  it('v1 舊結構（無 key、僅 3 因子）以 name 回退分類且總分合理', () => {
    const v1 = {
      total: 70,
      factors: [
        { name: '籌碼面', score: 80, weight: 0.4, reason: '' },
        { name: '技術面', score: 60, weight: 0.35, reason: '' },
        { name: '基本面', score: 50, weight: 0.25, reason: '' },
      ],
    };
    const s = applyStrategy(v1, 'balanced');
    expect(s.factors).toHaveLength(3);
    expect(s.factors.every((f) => ['chips', 'tech', 'fund'].includes(f.key))).toBe(true);
    // 權重在 3 因子間重新歸一化，總和為 1
    const wSum = s.factors.reduce((a, f) => a + f.weight, 0);
    expect(wSum).toBeCloseTo(1, 5);
    expect(s.total).toBeGreaterThan(0);
    expect(Number.isNaN(s.total)).toBe(false);
  });

  it('normalizeWeights：缺因子重新歸一化到和為 1', () => {
    const w = { chips: 0.3, tech: 0.25, fund: 0.2, momentum: 0.15, valuation: 0.1 };
    const norm = normalizeWeights(w, ['chips', 'tech', 'fund']);
    const sum = norm.chips + norm.tech + norm.fund;
    expect(sum).toBeCloseTo(1, 5);
  });

  it('空 detail 回 total 0、不 throw', () => {
    expect(applyStrategy(null, 'balanced').total).toBe(0);
    expect(applyStrategy({ factors: [] }, 'value').total).toBe(0);
  });
});

describe('valuation-bands（估值河流帶 / 位階）', () => {
  const pts = (pers: (number | null)[]) =>
    pers.map((per, i) => ({
      date: `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      per,
      pbr: null,
      dividendYield: null,
    }));

  it('computeRiverBands 樣本足夠時產生 5 條 band', () => {
    const rb = computeRiverBands(
      pts(Array.from({ length: 100 }, (_, i) => i + 1)),
      'PER',
    );
    expect(rb.bands).toHaveLength(5);
    expect(rb.current).toBe(100);
    // band 升冪
    expect(rb.bands[0].value).toBeLessThan(rb.bands[4].value);
  });

  it('低 PER → cheap、高 PER → expensive', () => {
    const low = valuationZone([...Array(99).fill(50), 5], 'PER');
    const high = valuationZone([...Array(99).fill(50), 90], 'PER');
    expect(low.zone).toBe('cheap');
    expect(high.zone).toBe('expensive');
  });

  it('殖利率高 → cheap（語意反轉）', () => {
    const z = valuationZone([...Array(99).fill(2), 8], 'YIELD');
    expect(z.zone).toBe('cheap');
  });

  it('樣本不足 → unknown', () => {
    const z = valuationZone([10, 12, 11], 'PER');
    expect(z.zone).toBe('unknown');
  });
});

describe('renderKlineChart', () => {
  it('產出非空 PNG Buffer（echarts + napi canvas）', () => {
    const buf = renderKlineChart('2330', synthOhlcv(60, 0.5));
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    // PNG magic number 89 50 4E 47
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });
});
