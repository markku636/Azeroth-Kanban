/**
 * 回測參數解析（共用參數 + 舊資料相容）。
 *
 * BacktestRun.params 為「扁平合併」物件（共用參數 + 策略專屬參數同層），舊 KD 紀錄亦同格式，
 * 故新舊資料皆可直接讀取。
 */
import { DEFAULT_COMMON_PARAMS, type CommonBacktestParams } from './types';

/** 夾擠數值至 [min, max]；非有限值回 fallback。 */
function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(Math.max(n, min), max);
}

/** 從扁平參數物件解析共用參數（夾擠到合理範圍 + 套預設）。 */
export function parseCommonParams(raw: unknown): CommonBacktestParams {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_COMMON_PARAMS;
  return {
    initialCapital: clampNum(src.initialCapital, 10_000, 1_000_000_000, d.initialCapital),
    feeRate: clampNum(src.feeRate, 0, 0.01, d.feeRate),
    taxRate: clampNum(src.taxRate, 0, 0.01, d.taxRate),
    stopLossPct: clampNum(src.stopLossPct, 0, 90, d.stopLossPct),
    takeProfitPct: clampNum(src.takeProfitPct, 0, 1000, d.takeProfitPct),
  };
}

/**
 * 將儲存的（可能為舊扁平 KD）參數正規化為 { strategyId, params }。
 * strategyId 取自 BacktestRun.strategy 欄位（空值視為 'kd'）；params 為數值化的扁平物件。
 */
export function normalizeStoredParams(
  raw: unknown,
  strategyCol: string | null | undefined,
): { strategyId: string; params: Record<string, number> } {
  const strategyId = strategyCol && strategyCol.trim() ? strategyCol.trim() : 'kd';
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const params: Record<string, number> = {};
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      params[k] = v;
    }
  }
  return { strategyId, params };
}
