/**
 * KD 策略回測（向後相容薄包裝）。
 *
 * 實際邏輯已抽至通用引擎（engine.ts）+ 策略註冊表（registry.ts）+ KD 策略定義（strategies/kd.ts）。
 * 本檔保留原對外 API（runKdBacktest / stochasticSeries / computeStats）以相容既有匯入與測試。
 */
import type { StockOhlcv } from '../stock-types';
import { runStrategyBacktest } from './registry';
import { DEFAULT_BACKTEST_PARAMS, type BacktestParams, type BacktestResult } from './types';

// 相容 re-export：stochasticSeries 移至 indicators、computeStats 移至 engine
export { stochasticSeries } from './indicators';
export { computeStats } from './engine';

/**
 * 執行 KD 策略回測（薄包裝：合併預設值後委派給通用引擎）。
 * @param klines 升冪日 K（至少需 kdPeriod + kdSignal + 2 筆才會有訊號）
 */
export function runKdBacktest(
  klines: StockOhlcv[],
  params: Partial<BacktestParams> = {},
): BacktestResult {
  const merged = { ...DEFAULT_BACKTEST_PARAMS, ...params } as Record<string, number>;
  return runStrategyBacktest(klines, 'kd', merged);
}
