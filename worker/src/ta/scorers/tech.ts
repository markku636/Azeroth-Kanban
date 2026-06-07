/** 技術面子分數：規則訊號 + 均線排列 + RSI 位階。 */
import type { TradeSignal } from '@azeroth/common';
import { clamp } from './util.js';

type TechInput = Pick<TradeSignal, 'action' | 'confidence' | 'indicators'>;

export function scoreTech(signal: TechInput): { score: number; reason: string } {
  const ind = signal.indicators;
  let s = 50;
  const parts: string[] = [];
  if (signal.action === 'BUY') {
    s += signal.confidence * 40;
    parts.push(`規則訊號 BUY(${signal.confidence})`);
  } else if (signal.action === 'SELL') {
    s -= signal.confidence * 40;
    parts.push(`規則訊號 SELL(${signal.confidence})`);
  }
  if (ind?.ma5 != null && ind?.ma20 != null && ind?.ma60 != null) {
    if (ind.ma5 > ind.ma20 && ind.ma20 > ind.ma60) {
      s += 10;
      parts.push('均線多頭排列');
    } else if (ind.ma5 < ind.ma20 && ind.ma20 < ind.ma60) {
      s -= 10;
      parts.push('均線空頭排列');
    }
  }
  if (ind?.rsi14 != null) {
    if (ind.rsi14 < 30) {
      s += 5;
      parts.push('RSI 超賣');
    } else if (ind.rsi14 > 70) {
      s -= 5;
      parts.push('RSI 超買');
    }
  }
  return { score: clamp(s), reason: parts.join('、') || '技術面中性' };
}
