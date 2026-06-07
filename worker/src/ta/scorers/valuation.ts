/**
 * 估值子分數：本益比 + 殖利率（便宜加分、昂貴扣分）。
 * WP-C（valuation-river）之後再以「估值河流位階」zone 增益。
 */
import type { StockFundamentalDto } from '@azeroth/common';
import { clamp } from './util.js';

/** 估值位階（WP-C 河流圖計算）；WP5 階段預設未提供。 */
export type ValuationZoneLevel = 'cheap' | 'fair' | 'expensive' | 'unknown';

export function scoreValuation(
  f: StockFundamentalDto,
  zone?: ValuationZoneLevel,
): { score: number; reason: string } {
  let s = 50;
  const parts: string[] = [];
  if (f.per != null) {
    if (f.per > 0 && f.per < 15) {
      s += 12;
      parts.push(`本益比 ${f.per}（偏低）`);
    } else if (f.per > 0 && f.per <= 25) {
      s += 5;
      parts.push(`本益比 ${f.per}`);
    } else if (f.per > 40) {
      s -= 12;
      parts.push(`本益比 ${f.per}（偏高）`);
    }
  }
  if (f.dividendYield != null) {
    if (f.dividendYield > 4) {
      s += 12;
      parts.push(`殖利率 ${f.dividendYield}%`);
    } else if (f.dividendYield > 2) {
      s += 6;
      parts.push(`殖利率 ${f.dividendYield}%`);
    }
  }
  if (zone === 'cheap') {
    s += 12;
    parts.push('估值位階便宜');
  } else if (zone === 'expensive') {
    s -= 12;
    parts.push('估值位階昂貴');
  }
  return { score: clamp(s), reason: parts.join('、') || '估值資料不足' };
}
