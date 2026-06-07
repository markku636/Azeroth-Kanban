/**
 * 均線交叉策略：短均線（快線）上穿長均線（慢線）買進、下穿賣出。
 */
import type { StockOhlcv } from '../../stock-types';
import { smaSeries } from '../indicators';
import { getStrategyMeta, type StrategyMeta } from '../strategy-meta';
import type { DaySignal } from '../types';
import type { StrategyDef } from '../registry';

const meta = getStrategyMeta('ma') as StrategyMeta;

function warmup(p: Record<string, number>): number {
  return p.slowPeriod - 1; // 慢線首個非 null 索引
}

function validate(p: Record<string, number>): string | null {
  if (p.fastPeriod >= p.slowPeriod) {
    return '快線週期需小於慢線週期';
  }
  return null;
}

function generateSignals(klines: StockOhlcv[], p: Record<string, number>): (DaySignal | null)[] {
  const closes = klines.map((k) => k.close);
  const fast = smaSeries(closes, p.fastPeriod);
  const slow = smaSeries(closes, p.slowPeriod);
  const out: (DaySignal | null)[] = new Array(klines.length).fill(null);
  for (let i = 1; i < klines.length; i++) {
    const f = fast[i];
    const s = slow[i];
    const pf = fast[i - 1];
    const ps = slow[i - 1];
    if (f !== null && s !== null && pf !== null && ps !== null) {
      if (pf <= ps && f > s) {
        out[i] = 'buy';
      } else if (pf >= ps && f < s) {
        out[i] = 'sell';
      }
    }
  }
  return out;
}

export const maStrategy: StrategyDef = { ...meta, warmup, validate, generateSignals };
