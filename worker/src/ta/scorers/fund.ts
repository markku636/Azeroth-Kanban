/**
 * 基本面子分數：營收成長 + EPS 獲利品質。
 * 估值（本益比 / 殖利率）已移至 valuation 因子，本因子聚焦「成長與獲利」。
 */
import type { StockFundamentalDto } from '@azeroth/common';
import { clamp } from './util.js';

export function scoreFund(f: StockFundamentalDto): { score: number; reason: string } {
  let s = 50;
  const parts: string[] = [];
  if (f.revenueYoy != null) {
    if (f.revenueYoy > 20) {
      s += 20;
      parts.push(`營收 YoY +${f.revenueYoy}%`);
    } else if (f.revenueYoy > 0) {
      s += 10;
      parts.push(`營收 YoY +${f.revenueYoy}%`);
    } else if (f.revenueYoy < -20) {
      s -= 20;
      parts.push(`營收 YoY ${f.revenueYoy}%`);
    } else {
      s -= 10;
      parts.push(`營收 YoY ${f.revenueYoy}%`);
    }
  }
  if (f.revenueMom != null && f.revenueMom > 0) {
    s += 5;
    parts.push(`營收 MoM +${f.revenueMom}%`);
  }
  if (f.eps != null) {
    if (f.eps > 0) {
      s += 10;
      parts.push(`EPS ${f.eps}`);
    } else {
      s -= 10;
      parts.push(`EPS ${f.eps}（虧損）`);
    }
  }
  return { score: clamp(s), reason: parts.join('、') || '基本面資料不足' };
}
