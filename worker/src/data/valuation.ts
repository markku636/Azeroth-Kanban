/**
 * 逐日估值（PER/PBR/殖利率）落庫 StockValuationDaily，供估值河流圖與位階判斷。
 * 與 loadFundamentals 共用同一 TaiwanStockPER 回應（0 額外 FinMind 呼叫）。
 */
import type { ValuationPoint } from '@azeroth/common';
import { prisma } from '../db.js';
import { fetchPerHistory, type PerRow } from './fundamentals.js';

/** 把 PER 序列落庫並回傳 ValuationPoint[]（升冪）。 */
export async function loadValuationHistory(
  symbol: string,
  perRows?: PerRow[],
): Promise<ValuationPoint[]> {
  const rows = perRows ?? (await fetchPerHistory(symbol));
  const points: ValuationPoint[] = rows
    .map((r) => ({
      date: r.date,
      per: r.PER ?? null,
      pbr: r.PBR ?? null,
      dividendYield: r.dividend_yield ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const p of points) {
    const tradeDate = new Date(`${p.date}T00:00:00Z`);
    await prisma.stockValuationDaily.upsert({
      where: { symbol_tradeDate: { symbol, tradeDate } },
      update: { per: p.per, pbr: p.pbr, dividendYield: p.dividendYield },
      create: { symbol, tradeDate, per: p.per, pbr: p.pbr, dividendYield: p.dividendYield },
    });
  }
  return points;
}
