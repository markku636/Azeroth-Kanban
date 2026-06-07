/** 籌碼面子分數：由 chip bias 與三大法人連買 bias 映射至 0~100。 */
import { clamp } from './util.js';

/**
 * @param chipBias 融資券/外資籌碼 bias（-2~2，來自 computeChipSummary）
 * @param instBias 三大法人連買賣 bias（-2~2，來自 computeInstitutionalSummary；WP-B 提供）
 */
export function scoreChips(chipBias: number, instBias = 0): { score: number; reason: string } {
  const bias = Math.max(-2, Math.min(2, chipBias + instBias));
  const score = clamp(50 + bias * 25);
  const reason =
    bias > 0
      ? '籌碼偏多（融資減/外資增/法人買超）'
      : bias < 0
        ? '籌碼偏空（融資增/外資減/法人賣超）'
        : '籌碼中性';
  return { score, reason };
}
