/**
 * 估值河流帶（本益比 / 股價淨值比 / 殖利率）純函式。
 *
 * 以該檔自身的歷史比率序列，畫出便宜～昂貴的水平 band（百分位），並判斷今日估值位階。
 * 不依賴歷史收盤價（FinMind TaiwanStockPER 直接提供逐日 PER/PBR/殖利率序列）。
 */

export type ValuationMetric = 'PER' | 'PBR' | 'YIELD';

export type ValuationZoneLevel = 'cheap' | 'fair' | 'expensive' | 'unknown';

export interface ValuationPoint {
  date: string;
  per: number | null;
  pbr: number | null;
  dividendYield: number | null;
}

export interface BandLevel {
  label: string;
  value: number;
}

export interface RiverBands {
  metric: ValuationMetric;
  dates: string[];
  /** 對齊 dates 的比率序列（PER / PBR / 殖利率%） */
  series: (number | null)[];
  /** 水平 band（百分位）；樣本不足時為空 */
  bands: BandLevel[];
  /** 最新一筆有效值 */
  current: number | null;
}

export interface ValuationZone {
  zone: ValuationZoneLevel;
  /** 今日比率在歷史的百分位（0~100，以「值大小」計） */
  percentile: number | null;
  current: number | null;
  label: string;
}

/** 計算估值位階所需的最少有效樣本數（約 3 個月交易日）。 */
const MIN_SAMPLES = 60;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function lastNonNull(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] != null) {
      return series[i];
    }
  }
  return null;
}

function metricValue(p: ValuationPoint, metric: ValuationMetric): number | null {
  const v = metric === 'PER' ? p.per : metric === 'PBR' ? p.pbr : p.dividendYield;
  // PER/PBR/殖利率 ≤0 視為失真（虧損 / 無配息），排除
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}

function quantile(sortedAsc: number[], q: number): number {
  const idx = (sortedAsc.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) {
    return sortedAsc[lo];
  }
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

/** 由逐日估值點算河流帶（百分位水平線）+ 比率序列。 */
export function computeRiverBands(points: ValuationPoint[], metric: ValuationMetric): RiverBands {
  const dates = points.map((p) => p.date);
  const series = points.map((p) => metricValue(p, metric));
  const valid = series.filter((v): v is number => v != null).sort((a, b) => a - b);
  const bands: BandLevel[] =
    valid.length >= MIN_SAMPLES
      ? [
          { label: '便宜(20%)', value: round2(quantile(valid, 0.2)) },
          { label: '偏低(35%)', value: round2(quantile(valid, 0.35)) },
          { label: '中位', value: round2(quantile(valid, 0.5)) },
          { label: '偏高(65%)', value: round2(quantile(valid, 0.65)) },
          { label: '昂貴(80%)', value: round2(quantile(valid, 0.8)) },
        ]
      : [];
  return { metric, dates, series, bands, current: lastNonNull(series) };
}

/** 由比率序列判斷今日估值位階（PER/PBR 越低越便宜；殖利率越高越便宜）。 */
export function valuationZone(series: (number | null)[], metric: ValuationMetric): ValuationZone {
  const valid = series.filter((v): v is number => v != null);
  const current = lastNonNull(series);
  if (valid.length < MIN_SAMPLES || current == null) {
    return { zone: 'unknown', percentile: null, current, label: '資料不足' };
  }
  const below = valid.filter((v) => v <= current).length;
  const percentile = Math.round((below / valid.length) * 100);
  // 殖利率：值越大越便宜 → 反轉「便宜百分位」語意
  const cheapPctile = metric === 'YIELD' ? 100 - percentile : percentile;
  let zone: ValuationZoneLevel;
  let label: string;
  if (cheapPctile <= 20) {
    zone = 'cheap';
    label = '便宜（歷史低檔）';
  } else if (cheapPctile >= 70) {
    zone = 'expensive';
    label = '昂貴（歷史高檔）';
  } else {
    zone = 'fair';
    label = '合理';
  }
  return { zone, percentile, current, label };
}
