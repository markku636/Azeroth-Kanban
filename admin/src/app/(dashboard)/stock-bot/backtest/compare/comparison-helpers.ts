/** 比較頁共用：格式化、色盤、best/worst 計算。 */
import { dateOnly, gainCls, money, pct } from '../BacktestResultView';

export { dateOnly, gainCls, money, pct };

/** 色盲友善 6 色（超過則循環）。 */
export const COMPARE_PALETTE = [
  '#2563eb', // 藍
  '#dc2626', // 紅
  '#16a34a', // 綠
  '#d97706', // 橘
  '#7c3aed', // 紫
  '#0891b2', // 青
];

export function colorForIndex(i: number): string {
  return COMPARE_PALETTE[i % COMPARE_PALETTE.length];
}

/**
 * 在一組數值中找最佳 / 最差的索引（null / 非有限值不參與）。
 * @param lowerIsBetter true 時越小越好（如最大回撤、波動度）
 */
export function bestWorst(
  values: (number | null)[],
  lowerIsBetter = false,
): { best: number; worst: number } {
  let best = -1;
  let worst = -1;
  let bestVal = lowerIsBetter ? Infinity : -Infinity;
  let worstVal = lowerIsBetter ? -Infinity : Infinity;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      return;
    }
    if (lowerIsBetter ? v < bestVal : v > bestVal) {
      bestVal = v;
      best = i;
    }
    if (lowerIsBetter ? v > worstVal : v < worstVal) {
      worstVal = v;
      worst = i;
    }
  });
  return { best, worst };
}
