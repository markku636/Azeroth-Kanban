/**
 * RSI 策略：RSI 由上跌破超賣門檻買進、由下突破超買門檻賣出（逆勢 / 區間操作）。
 */
import type { StockOhlcv } from '../../stock-types';
import { rsiSeries } from '../indicators';
import { getStrategyMeta, type StrategyMeta } from '../strategy-meta';
import type { DaySignal } from '../types';
import type { StrategyDef } from '../registry';

const meta = getStrategyMeta('rsi') as StrategyMeta;

function warmup(p: Record<string, number>): number {
  return p.period; // RSI 首個非 null 索引（Wilder）
}

function validate(p: Record<string, number>): string | null {
  if (p.oversold >= p.overbought) {
    return '超賣門檻需小於超買門檻';
  }
  return null;
}

function generateSignals(klines: StockOhlcv[], p: Record<string, number>): (DaySignal | null)[] {
  const closes = klines.map((k) => k.close);
  const rsi = rsiSeries(closes, p.period);
  const out: (DaySignal | null)[] = new Array(klines.length).fill(null);
  for (let i = 1; i < klines.length; i++) {
    const cur = rsi[i];
    const prev = rsi[i - 1];
    if (cur !== null && prev !== null) {
      if (prev >= p.oversold && cur < p.oversold) {
        out[i] = 'buy';
      } else if (prev <= p.overbought && cur > p.overbought) {
        out[i] = 'sell';
      }
    }
  }
  return out;
}

export const rsiStrategy: StrategyDef = { ...meta, warmup, validate, generateSignals };
