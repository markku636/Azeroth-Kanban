/**
 * MACD 策略：柱狀體由負翻正（金叉）買進、由正翻負（死叉）賣出。
 */
import type { StockOhlcv } from '../../stock-types';
import { macdSeries } from '../indicators';
import { getStrategyMeta, type StrategyMeta } from '../strategy-meta';
import type { DaySignal } from '../types';
import type { StrategyDef } from '../registry';

const meta = getStrategyMeta('macd') as StrategyMeta;

function warmup(p: Record<string, number>): number {
  return p.slow - 1 + (p.signal - 1); // MACD 首個非 null 索引
}

function validate(p: Record<string, number>): string | null {
  if (p.fast >= p.slow) {
    return '快線週期需小於慢線週期';
  }
  return null;
}

function generateSignals(klines: StockOhlcv[], p: Record<string, number>): (DaySignal | null)[] {
  const closes = klines.map((k) => k.close);
  const macd = macdSeries(closes, p.fast, p.slow, p.signal);
  const out: (DaySignal | null)[] = new Array(klines.length).fill(null);
  for (let i = 1; i < klines.length; i++) {
    const cur = macd[i];
    const prev = macd[i - 1];
    if (cur && prev) {
      if (prev.histogram <= 0 && cur.histogram > 0) {
        out[i] = 'buy';
      } else if (prev.histogram >= 0 && cur.histogram < 0) {
        out[i] = 'sell';
      }
    }
  }
  return out;
}

export const macdStrategy: StrategyDef = { ...meta, warmup, validate, generateSignals };
