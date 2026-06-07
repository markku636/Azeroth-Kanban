/** 評分共用工具。 */

/** 夾在 0~100。 */
export function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
