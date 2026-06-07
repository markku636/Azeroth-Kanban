/**
 * 三大法人逐日買賣超（外資 / 投信 / 自營），落庫 StockInstitutional。
 * FinMind TaiwanStockInstitutionalInvestorsBuySell 每日每法人一列，依日彙整成單列。
 */
import type { InstitutionalTrade } from '@azeroth/common';
import { prisma } from '../db.js';
import { fetchInstitutionalTrades } from './finmind.js';

/** 依日彙整的三大法人淨買賣超（股）。 */
export interface InstitutionalDaily {
  date: string;
  foreignNet: number;
  trustNet: number;
  dealerNet: number;
  totalNet: number;
}

/** 由 FinMind 法人名稱歸類至三大法人。 */
function classify(name: string): 'foreign' | 'trust' | 'dealer' | null {
  if (name.includes('外資') || name.includes('Foreign')) {
    return 'foreign';
  }
  if (name.includes('投信') || name.includes('Investment')) {
    return 'trust';
  }
  if (name.includes('自營') || name.includes('Dealer')) {
    return 'dealer';
  }
  return null;
}

/**
 * 載入近 N 日三大法人買賣超，依日彙整並 upsert StockInstitutional。
 * 回傳依日合計序列（升冪）；來源失敗回空陣列（不整批失敗）。
 */
export async function loadInstitutional(symbol: string, days = 30): Promise<InstitutionalDaily[]> {
  const start = new Date(Date.now() - days * 1.6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  const rows: InstitutionalTrade[] = await fetchInstitutionalTrades(symbol, start, end).catch(
    () => [],
  );

  const byDate = new Map<string, InstitutionalDaily>();
  for (const r of rows) {
    const cls = classify(r.name);
    if (!cls) {
      continue;
    }
    let cur = byDate.get(r.date);
    if (!cur) {
      cur = { date: r.date, foreignNet: 0, trustNet: 0, dealerNet: 0, totalNet: 0 };
      byDate.set(r.date, cur);
    }
    if (cls === 'foreign') {
      cur.foreignNet += r.net;
    } else if (cls === 'trust') {
      cur.trustNet += r.net;
    } else {
      cur.dealerNet += r.net;
    }
  }

  const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of daily) {
    d.totalNet = d.foreignNet + d.trustNet + d.dealerNet;
    const tradeDate = new Date(`${d.date}T00:00:00Z`);
    await prisma.stockInstitutional.upsert({
      where: { symbol_tradeDate: { symbol, tradeDate } },
      update: {
        foreignNet: d.foreignNet,
        trustNet: d.trustNet,
        dealerNet: d.dealerNet,
        totalNet: d.totalNet,
      },
      create: {
        symbol,
        tradeDate,
        foreignNet: d.foreignNet,
        trustNet: d.trustNet,
        dealerNet: d.dealerNet,
        totalNet: d.totalNet,
      },
    });
  }
  return daily;
}
