/**
 * KD 黃金/死亡交叉策略。
 * 訊號刻意與 admin kd-verdict.ts 的買/賣箭頭一致：低檔黃金交叉買、高檔死亡交叉賣。
 */
import type { StockOhlcv } from '../../stock-types';
import { stochasticSeries } from '../indicators';
import { getStrategyMeta, type StrategyMeta } from '../strategy-meta';
import type { DaySignal } from '../types';
import type { StrategyDef } from '../registry';

const meta = getStrategyMeta('kd') as StrategyMeta;

function warmup(p: Record<string, number>): number {
  return p.kdPeriod - 1 + (p.kdSignal - 1);
}

function validate(p: Record<string, number>): string | null {
  if (p.buyBelow >= p.sellAbove) {
    return '買進門檻需小於賣出門檻';
  }
  return null;
}

function generateSignals(klines: StockOhlcv[], p: Record<string, number>): (DaySignal | null)[] {
  const kd = stochasticSeries(klines, p.kdPeriod, p.kdSignal);
  const out: (DaySignal | null)[] = new Array(klines.length).fill(null);
  for (let i = 1; i < klines.length; i++) {
    const cur = kd[i];
    const prev = kd[i - 1];
    if (cur && prev) {
      if (prev.k <= prev.d && cur.k > cur.d && cur.k < p.buyBelow) {
        out[i] = 'buy';
      } else if (prev.k >= prev.d && cur.k < cur.d && cur.k > p.sellAbove) {
        out[i] = 'sell';
      }
    }
  }
  return out;
}

export const kdStrategy: StrategyDef = { ...meta, warmup, validate, generateSignals };
