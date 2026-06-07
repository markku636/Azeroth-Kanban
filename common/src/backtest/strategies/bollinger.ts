/**
 * 布林通道策略：收盤突破上軌買進、跌破中軌（均線）賣出（波動率突破）。
 */
import type { StockOhlcv } from '../../stock-types';
import { bollingerSeries } from '../indicators';
import { getStrategyMeta, type StrategyMeta } from '../strategy-meta';
import type { DaySignal } from '../types';
import type { StrategyDef } from '../registry';

const meta = getStrategyMeta('bollinger') as StrategyMeta;

function warmup(p: Record<string, number>): number {
  return p.period - 1; // 布林首個非 null 索引
}

function validate(p: Record<string, number>): string | null {
  if (p.stdDev <= 0) {
    return '標準差倍數需大於 0';
  }
  return null;
}

function generateSignals(klines: StockOhlcv[], p: Record<string, number>): (DaySignal | null)[] {
  const closes = klines.map((k) => k.close);
  const bb = bollingerSeries(closes, p.period, p.stdDev);
  const out: (DaySignal | null)[] = new Array(klines.length).fill(null);
  for (let i = 1; i < klines.length; i++) {
    const cur = bb[i];
    const prev = bb[i - 1];
    if (cur && prev) {
      if (closes[i - 1] <= prev.upper && closes[i] > cur.upper) {
        out[i] = 'buy';
      } else if (closes[i - 1] >= prev.middle && closes[i] < cur.middle) {
        out[i] = 'sell';
      }
    }
  }
  return out;
}

export const bollingerStrategy: StrategyDef = { ...meta, warmup, validate, generateSignals };
