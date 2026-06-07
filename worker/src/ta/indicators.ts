/**
 * 技術指標計算 — 以 technicalindicators 為主，補上量能比、趨勢動能指標與背離偵測。
 * 取序列尾端代表值，回傳共用 StockIndicators。
 */
import type { StockOhlcv, StockIndicators, CandlePattern } from '@azeroth/common';
import {
  SMA,
  EMA,
  RSI,
  MACD,
  Stochastic,
  BollingerBands,
  ADX,
  WilliamsR,
  CCI,
  OBV,
  PSAR,
} from 'technicalindicators';

// 指標週期常數
const ADX_PERIOD = 14;
const WILLIAMS_PERIOD = 14;
const CCI_PERIOD = 20;
const SAR_STEP = 0.02;
const SAR_MAX = 0.2;
const OBV_TREND_LOOKBACK = 5;

function last<T>(arr: T[]): T | undefined {
  return arr.length ? arr[arr.length - 1] : undefined;
}

function lastNumber(arr: number[]): number | null {
  const v = last(arr);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function round2(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/** 左補 fill 使序列對齊指定長度（短指標序列對齊原始 K 線長度）。 */
function padLeft<T>(arr: T[], len: number, fill: T): T[] {
  const pad = len - arr.length;
  if (pad <= 0) {
    return arr;
  }
  return [...(Array(pad).fill(fill) as T[]), ...arr];
}

interface Pivot {
  index: number;
  value: number;
}

/** 找局部高/低 pivot（左右各 leftRight 根都不超過/不低於自己）。 */
function findPivots(values: (number | null)[], leftRight: number, kind: 'high' | 'low'): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = leftRight; i < values.length - leftRight; i++) {
    const v = values[i];
    if (v == null) {
      continue;
    }
    let isPivot = true;
    for (let j = i - leftRight; j <= i + leftRight; j++) {
      if (j === i) {
        continue;
      }
      const w = values[j];
      if (w == null || (kind === 'high' && w > v) || (kind === 'low' && w < v)) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) {
      pivots.push({ index: i, value: v });
    }
  }
  return pivots;
}

/**
 * 背離偵測：價格與震盪指標近端 swing 高低點方向相反。
 * 頂背離（bearish）：價創新高但指標較低；底背離（bullish）：價創新低但指標較高。
 */
export function detectDivergence(
  price: number[],
  osc: (number | null)[],
  lookback = 40,
  leftRight = 3,
): { bullish: boolean; bearish: boolean } {
  const n = price.length;
  if (n < leftRight * 2 + 2) {
    return { bullish: false, bearish: false };
  }
  const start = Math.max(0, n - lookback);
  const priceWin = price.slice(start);
  const oscWin = osc.slice(start);

  let bearish = false;
  const highs = findPivots(priceWin, leftRight, 'high');
  if (highs.length >= 2) {
    const a = highs[highs.length - 2];
    const b = highs[highs.length - 1];
    const oscA = oscWin[a.index];
    const oscB = oscWin[b.index];
    if (oscA != null && oscB != null && b.value > a.value && oscB < oscA) {
      bearish = true;
    }
  }

  let bullish = false;
  const lows = findPivots(priceWin, leftRight, 'low');
  if (lows.length >= 2) {
    const a = lows[lows.length - 2];
    const b = lows[lows.length - 1];
    const oscA = oscWin[a.index];
    const oscB = oscWin[b.index];
    if (oscA != null && oscB != null && b.value < a.value && oscB > oscA) {
      bullish = true;
    }
  }

  return { bullish, bearish };
}

/** 計算各項指標的尾端值。 */
export function computeIndicators(ohlcv: StockOhlcv[]): StockIndicators {
  const close = ohlcv.map((o) => o.close);
  const high = ohlcv.map((o) => o.high);
  const low = ohlcv.map((o) => o.low);
  const volume = ohlcv.map((o) => o.volume);
  const lastClose = last(close) ?? null;

  const ma5 = lastNumber(SMA.calculate({ period: 5, values: close }));
  const ma20 = lastNumber(SMA.calculate({ period: 20, values: close }));
  const ma60 = lastNumber(SMA.calculate({ period: 60, values: close }));
  const ma120 = lastNumber(SMA.calculate({ period: 120, values: close }));
  const ma240 = lastNumber(SMA.calculate({ period: 240, values: close }));
  const ema12 = lastNumber(EMA.calculate({ period: 12, values: close }));
  const ema26 = lastNumber(EMA.calculate({ period: 26, values: close }));
  const rsi14 = lastNumber(RSI.calculate({ period: 14, values: close }));

  const macdSeries = MACD.calculate({
    values: close,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const macdLast = last(macdSeries);

  const stochSeries = Stochastic.calculate({
    high,
    low,
    close,
    period: 14,
    signalPeriod: 3,
  });
  const stochLast = last(stochSeries);

  const bbSeries = BollingerBands.calculate({ period: 20, values: close, stdDev: 2 });
  const bbLast = last(bbSeries);

  // 量能比：當日量 / 近 20 日均量
  const avgVol20 = lastNumber(SMA.calculate({ period: 20, values: volume }));
  const todayVol = last(volume) ?? null;
  const volumeRatio =
    avgVol20 && avgVol20 > 0 && todayVol != null
      ? Math.round((todayVol / avgVol20) * 100) / 100
      : null;

  // ─── 趨勢動能 ───
  const adxLast = last(ADX.calculate({ high, low, close, period: ADX_PERIOD }));
  const williamsR = lastNumber(WilliamsR.calculate({ high, low, close, period: WILLIAMS_PERIOD }));
  const cci = lastNumber(CCI.calculate({ high, low, close, period: CCI_PERIOD }));

  const obvArr = OBV.calculate({ close, volume });
  const obvValue = lastNumber(obvArr);
  const obvPrev =
    obvArr.length > OBV_TREND_LOOKBACK ? obvArr[obvArr.length - 1 - OBV_TREND_LOOKBACK] : null;
  const obvTrend: 'up' | 'down' | 'flat' | null =
    obvValue == null || obvPrev == null
      ? null
      : obvValue > obvPrev
        ? 'up'
        : obvValue < obvPrev
          ? 'down'
          : 'flat';

  const sarValue = lastNumber(PSAR.calculate({ high, low, step: SAR_STEP, max: SAR_MAX }));
  const sarPosition: 'long' | 'short' | null =
    sarValue == null || lastClose == null ? null : lastClose >= sarValue ? 'long' : 'short';

  const biasOf = (period: number): number | null => {
    const ma = lastNumber(SMA.calculate({ period, values: close }));
    return ma != null && ma !== 0 && lastClose != null
      ? Math.round(((lastClose - ma) / ma) * 10000) / 100
      : null;
  };

  // 背離：以 close 為價、各震盪指標序列對齊後比較近端 swing
  const macdHistSeries = padLeft<number | null>(
    macdSeries.map((m) => m.histogram ?? null),
    close.length,
    null,
  );
  const rsiSeries = padLeft<number | null>(
    RSI.calculate({ period: 14, values: close }),
    close.length,
    null,
  );
  const obvAligned = padLeft<number | null>(obvArr, close.length, null);
  const macdDiv = detectDivergence(close, macdHistSeries);
  const rsiDiv = detectDivergence(close, rsiSeries);
  const volDiv = detectDivergence(close, obvAligned);

  return {
    ma5,
    ma20,
    ma60,
    ema12,
    ema26,
    rsi14: rsi14 != null ? Math.round(rsi14 * 100) / 100 : null,
    macd: {
      macd: macdLast?.MACD ?? null,
      signal: macdLast?.signal ?? null,
      histogram: macdLast?.histogram ?? null,
    },
    kd: {
      k: stochLast?.k ?? null,
      d: stochLast?.d ?? null,
    },
    bollinger: {
      upper: bbLast?.upper ?? null,
      middle: bbLast?.middle ?? null,
      lower: bbLast?.lower ?? null,
    },
    volumeRatio,
    dmi: {
      plusDi: round2(adxLast?.pdi),
      minusDi: round2(adxLast?.mdi),
      adx: round2(adxLast?.adx),
    },
    williamsR: round2(williamsR),
    cci: round2(cci),
    obv: { value: obvValue, trend: obvTrend },
    bias: { bias5: biasOf(5), bias10: biasOf(10), bias20: biasOf(20) },
    sar: { value: round2(sarValue), position: sarPosition },
    divergence: {
      macdBullish: macdDiv.bullish,
      macdBearish: macdDiv.bearish,
      rsiBullish: rsiDiv.bullish,
      rsiBearish: rsiDiv.bearish,
      volumeBullish: volDiv.bullish,
      volumeBearish: volDiv.bearish,
    },
    ma120,
    ma240,
  };
}

/**
 * K 線型態偵測（自實作，避免依賴 technicalindicators v2/v3 差異）。
 * 僅判斷最後一根（搭配前一根）。
 */
export function detectPatterns(ohlcv: StockOhlcv[]): CandlePattern[] {
  if (ohlcv.length < 2) {
    return [];
  }
  const patterns: CandlePattern[] = [];
  const cur = ohlcv[ohlcv.length - 1];
  const prev = ohlcv[ohlcv.length - 2];

  const body = Math.abs(cur.close - cur.open);
  const range = cur.high - cur.low || 1e-9;
  const upperWick = cur.high - Math.max(cur.open, cur.close);
  const lowerWick = Math.min(cur.open, cur.close) - cur.low;

  // Doji：實體極小
  if (body / range < 0.1) {
    patterns.push({ code: 'doji', bias: 'neutral' });
  }

  // Hammer：長下影、短上影、實體偏上（多方反轉）
  if (lowerWick > body * 2 && upperWick < body && body / range < 0.4) {
    patterns.push({ code: 'hammer', bias: 'bullish' });
  }

  // Shooting Star：長上影、短下影（空方反轉）
  if (upperWick > body * 2 && lowerWick < body && body / range < 0.4) {
    patterns.push({ code: 'shootingStar', bias: 'bearish' });
  }

  // Bullish Engulfing：前黑後紅且實體吞噬
  const prevBearish = prev.close < prev.open;
  const curBullish = cur.close > cur.open;
  if (prevBearish && curBullish && cur.close >= prev.open && cur.open <= prev.close) {
    patterns.push({ code: 'bullishEngulfing', bias: 'bullish' });
  }

  // Bearish Engulfing：前紅後黑且實體吞噬
  const prevBullish = prev.close > prev.open;
  const curBearish = cur.close < cur.open;
  if (prevBullish && curBearish && cur.open >= prev.close && cur.close <= prev.open) {
    patterns.push({ code: 'bearishEngulfing', bias: 'bearish' });
  }

  return patterns;
}

/** 取得某指標的完整序列（供畫圖疊圖用）。 */
export function maSeries(ohlcv: StockOhlcv[], period: number): (number | null)[] {
  const close = ohlcv.map((o) => o.close);
  const sma = SMA.calculate({ period, values: close });
  // 對齊原始長度（前段補 null）
  const pad = ohlcv.length - sma.length;
  return [...Array(Math.max(0, pad)).fill(null), ...sma];
}
