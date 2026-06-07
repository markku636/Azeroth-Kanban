/**
 * 回測用指標序列（純函式，無外部依賴）。
 *
 * 設計約束（重要）：
 * - 每個函式回傳與輸入「等長」的陣列，warmup（資料不足）期一律為 `null`，永不丟例外或 NaN。
 * - common 維持零 npm 依賴，故指標皆手刻；正確性由 worker 端 oracle 測試對拍 `technicalindicators`。
 * - warmup 首個非 null index 約定（供策略 warmup() 與比較對齊使用）：
 *   SMA: period-1；EMA: period-1（SMA 種子）；Bollinger: period-1；
 *   RSI(Wilder): period（需 period 筆差值）；MACD: (slow-1)+(signal-1)；KD: (period-1)+(signal-1)。
 */

/** 快速 KD 單點。 */
export interface KdPoint {
  k: number;
  d: number;
}

/** MACD 單點（DIF / 訊號線 / 柱狀體）。 */
export interface MacdPoint {
  macd: number;
  signal: number;
  histogram: number;
}

/** 布林通道單點。 */
export interface BollingerPoint {
  upper: number;
  middle: number;
  lower: number;
}

/** 簡單移動平均序列（SMA）。 */
export function smaSeries(values: number[], period: number): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (period < 1 || n < period) {
    return out;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    if (i >= period - 1) {
      out[i] = sum / period;
    }
  }
  return out;
}

/**
 * 指數移動平均序列（EMA），以前 period 筆的 SMA 作為種子（index = period-1）。
 * 切勿用 values[0] 當種子（會在前段引入偏差）。
 */
export function emaSeries(values: number[], period: number): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (period < 1 || n < period) {
    return out;
  }
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) {
    seed += values[i];
  }
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * RSI 序列（Wilder 平滑）。首值於 index = period（需 period 筆漲跌差）。
 * avgLoss 為 0 時回 100（全漲、無回檔）。
 */
export function rsiSeries(closes: number[], period: number): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (period < 1 || n <= period) {
    return out;
  }
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) {
      gainSum += ch;
    } else {
      lossSum -= ch;
    }
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * MACD 序列。DIF = EMA(fast) − EMA(slow)；訊號線 = 對「壓實後 DIF 陣列」做 EMA
 * （以 signal 期 SMA 為種子），再依 (slow-1)+(signal-1) 對齊回原索引；柱狀體 = DIF − 訊號線。
 */
export function macdSeries(
  closes: number[],
  fast: number,
  slow: number,
  signal: number,
): (MacdPoint | null)[] {
  const n = closes.length;
  const out: (MacdPoint | null)[] = new Array(n).fill(null);
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const compact: number[] = [];
  const compactIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (f !== null && s !== null) {
      compact.push(f - s);
      compactIdx.push(i);
    }
  }
  const sigCompact = emaSeries(compact, signal);
  for (let c = 0; c < compact.length; c++) {
    const sig = sigCompact[c];
    if (sig !== null) {
      const macdVal = compact[c];
      out[compactIdx[c]] = { macd: macdVal, signal: sig, histogram: macdVal - sig };
    }
  }
  return out;
}

/** 布林通道序列（中軌 = SMA，上下軌 = 中軌 ± 倍數 × 母體標準差）。 */
export function bollingerSeries(
  closes: number[],
  period: number,
  stdDevMult: number,
): (BollingerPoint | null)[] {
  const n = closes.length;
  const out: (BollingerPoint | null)[] = new Array(n).fill(null);
  if (period < 1 || n < period) {
    return out;
  }
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += closes[j];
    }
    const mean = sum / period;
    let varSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      varSum += (closes[j] - mean) ** 2;
    }
    const sd = Math.sqrt(varSum / period); // 母體標準差（÷period）
    out[i] = { upper: mean + stdDevMult * sd, middle: mean, lower: mean - stdDevMult * sd };
  }
  return out;
}

/**
 * 快速 KD 序列（k = 原始 %K，d = k 的 signal 期 SMA），回傳與 klines 等長、warmup 期為 null。
 * 與 admin kd-verdict.ts 的 stochastic() 同公式（區間為 0 視為中性 50，避免除以零）。
 */
export function stochasticSeries(
  klines: { high: number; low: number; close: number }[],
  period: number,
  signal: number,
): (KdPoint | null)[] {
  const n = klines.length;
  const out: (KdPoint | null)[] = new Array(n).fill(null);
  if (n < period) {
    return out;
  }
  const rawK: (number | null)[] = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (klines[j].high > hh) {
        hh = klines[j].high;
      }
      if (klines[j].low < ll) {
        ll = klines[j].low;
      }
    }
    const range = hh - ll;
    rawK[i] = range > 0 ? ((klines[i].close - ll) / range) * 100 : 50;
  }
  const firstValid = period - 1 + (signal - 1);
  for (let i = firstValid; i < n; i++) {
    let sum = 0;
    for (let j = i - signal + 1; j <= i; j++) {
      sum += rawK[j] as number;
    }
    out[i] = { k: rawK[i] as number, d: sum / signal };
  }
  return out;
}
