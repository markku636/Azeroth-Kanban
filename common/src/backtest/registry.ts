/**
 * 策略註冊表：通用引擎 + 各策略訊號產生純函式。
 *
 * 加新策略只需：在 strategies/ 新增一個 StrategyDef、於 STRATEGY_REGISTRY 註冊一行、
 * 並在 strategy-meta.ts 補中繼資料（前端表單自動帶出）。
 */
import type { StockOhlcv } from '../stock-types';
import { runBacktest } from './engine';
import { parseCommonParams } from './params';
import { clampParams, type StrategyMeta } from './strategy-meta';
import type { BacktestResult, DaySignal } from './types';
import { kdStrategy } from './strategies/kd';
import { maStrategy } from './strategies/ma-cross';
import { macdStrategy } from './strategies/macd';
import { rsiStrategy } from './strategies/rsi';
import { bollingerStrategy } from './strategies/bollinger';

/** 策略定義 = 中繼資料 + 行為（暖身 / 跨欄位驗證 / 訊號產生）。 */
export interface StrategyDef extends StrategyMeta {
  /** 暖身根數（指標首個非 null 的索引；引擎起算點 + 比較對齊用） */
  warmup(p: Record<string, number>): number;
  /** 跨欄位驗證；通過回 null，否則回中文錯誤訊息 */
  validate(p: Record<string, number>): string | null;
  /** 產生與 klines 等長的訊號陣列（signals[i] = 第 i 日收盤確認） */
  generateSignals(klines: StockOhlcv[], p: Record<string, number>): (DaySignal | null)[];
}

/** 策略註冊表（id → 定義）。 */
export const STRATEGY_REGISTRY: Record<string, StrategyDef> = {
  kd: kdStrategy,
  ma: maStrategy,
  macd: macdStrategy,
  rsi: rsiStrategy,
  bollinger: bollingerStrategy,
};

/** 依 id 取策略定義。 */
export function getStrategy(id: string): StrategyDef | undefined {
  return STRATEGY_REGISTRY[id];
}

/** 所有策略 id。 */
export function listStrategyIds(): string[] {
  return Object.keys(STRATEGY_REGISTRY);
}

/**
 * 以指定策略執行回測。
 * @param params 扁平合併參數（共用 + 策略專屬）
 * @param startIndex 起算點覆寫（比較頁公平對齊用）
 * @throws 若 strategyId 未知
 */
export function runStrategyBacktest(
  klines: StockOhlcv[],
  strategyId: string,
  params: Record<string, number>,
  startIndex?: number,
): BacktestResult {
  const strat = getStrategy(strategyId);
  if (!strat) {
    throw new Error(`未知的回測策略：${strategyId}`);
  }
  const sp = clampParams(strat, params);
  const common = parseCommonParams(params);
  const signals = strat.generateSignals(klines, sp);
  return runBacktest(klines, signals, strat.warmup(sp), common, startIndex);
}
