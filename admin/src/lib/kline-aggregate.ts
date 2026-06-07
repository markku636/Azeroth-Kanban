/**
 * K 線聚合工具：把日線 OHLCV 聚合成週線（ISO 週）/ 月線。
 *
 * 從 KlineChart 抽出共用，供 K 線圖與多週期 KD 紅綠燈（kd-verdict）共用同一份聚合邏輯，
 * 避免日 → 週/月的聚合在多處各寫一份。
 */

export type Period = 'day' | 'week' | 'month';

/** 聚合後的單根 K 棒（OHLCV）。 */
export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 依週期把交易日歸入同一個 bucket（月：年-月；週：ISO 年-週）。 */
export function bucketKey(dateStr: string, period: Period): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (period === 'month') {
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  }
  // ISO 週
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((tmp.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7,
    );
  return `${tmp.getUTCFullYear()}-W${week}`;
}

/**
 * 日線聚合成週/月 OHLCV。
 * `period === 'day'` 時原樣轉成 Bar[]（去掉 KlinePoint 的 MA 等額外欄位）。
 */
export function aggregate<T extends Bar>(points: T[], period: Period): Bar[] {
  if (period === 'day') {
    return points.map((p) => ({
      date: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
  }
  const buckets = new Map<string, Bar>();
  for (const p of points) {
    const k = bucketKey(p.date, period);
    const b = buckets.get(k);
    if (!b) {
      buckets.set(k, {
        date: p.date,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume,
      });
    } else {
      b.high = Math.max(b.high, p.high);
      b.low = Math.min(b.low, p.low);
      b.close = p.close;
      b.volume += p.volume;
      b.date = p.date;
    }
  }
  return Array.from(buckets.values());
}
