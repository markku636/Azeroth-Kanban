/**
 * 趨勢動能子分數：ADX 趨勢方向/強度 + 背離 + 威廉%R/CCI/乖離率位階 + OBV/SAR 方向。
 */
import type { StockIndicators } from '@azeroth/common';
import { clamp } from './util.js';

export function scoreMomentum(ind: StockIndicators): { score: number; reason: string } {
  let s = 50;
  const parts: string[] = [];

  // ADX 趨勢方向與強度（>25 視為有趨勢）
  const { adx, plusDi, minusDi } = ind.dmi;
  if (adx != null && plusDi != null && minusDi != null && adx > 25) {
    if (plusDi > minusDi) {
      s += 12;
      parts.push(`ADX ${adx} 多方趨勢`);
    } else if (minusDi > plusDi) {
      s -= 12;
      parts.push(`ADX ${adx} 空方趨勢`);
    }
  }

  // 背離
  if (ind.divergence.macdBullish || ind.divergence.rsiBullish) {
    s += 8;
    parts.push('指標底背離');
  }
  if (ind.divergence.macdBearish || ind.divergence.rsiBearish) {
    s -= 8;
    parts.push('指標頂背離');
  }
  if (ind.divergence.volumeBullish) {
    s += 4;
    parts.push('量價底背離');
  }
  if (ind.divergence.volumeBearish) {
    s -= 4;
    parts.push('量價頂背離');
  }

  // 威廉 %R 超買超賣（-80 以下偏冷、-20 以上偏熱）
  if (ind.williamsR != null) {
    if (ind.williamsR < -80) {
      s += 6;
      parts.push('威廉 %R 超賣');
    } else if (ind.williamsR > -20) {
      s -= 6;
      parts.push('威廉 %R 超買');
    }
  }

  // CCI 轉強/轉弱
  if (ind.cci != null) {
    if (ind.cci > 100) {
      s += 5;
      parts.push('CCI 轉強');
    } else if (ind.cci < -100) {
      s -= 5;
      parts.push('CCI 轉弱');
    }
  }

  // 乖離率（20 日）過大易拉回 / 過低易反彈
  if (ind.bias.bias20 != null) {
    if (ind.bias.bias20 > 12) {
      s -= 5;
      parts.push('乖離過大');
    } else if (ind.bias.bias20 < -12) {
      s += 5;
      parts.push('乖離過低（易反彈）');
    }
  }

  // OBV 量能方向
  if (ind.obv.trend === 'up') {
    s += 4;
    parts.push('OBV 量能上升');
  } else if (ind.obv.trend === 'down') {
    s -= 4;
    parts.push('OBV 量能下降');
  }

  // SAR 多空位置
  if (ind.sar.position === 'long') {
    s += 4;
    parts.push('SAR 偏多');
  } else if (ind.sar.position === 'short') {
    s -= 4;
    parts.push('SAR 偏空');
  }

  return { score: clamp(s), reason: parts.join('、') || '趨勢動能中性' };
}
