/**
 * 籌碼面資料（FinMind 免費):融資融券餘額 + 外資持股比例。
 * （集中度/千張大戶 dataset 需付費，本階段不用。）
 */
import type { ChipDaily } from '@azeroth/common';
import { prisma } from '../db.js';
import { finmindGet } from './finmind.js';

interface MarginRow {
  date: string;
  MarginPurchaseTodayBalance: number;
  ShortSaleTodayBalance: number;
}
interface ShareholdingRow {
  date: string;
  ForeignInvestmentSharesRatio: number;
}

/** 融資/融券餘額（張）。 */
export async function fetchMarginShort(
  symbol: string,
  startDate: string,
): Promise<{ date: string; marginBalance: number; shortBalance: number }[]> {
  const rows = await finmindGet<MarginRow>({
    dataset: 'TaiwanStockMarginPurchaseShortSale',
    data_id: symbol,
    start_date: startDate,
  });
  return rows.map((r) => ({
    date: r.date,
    marginBalance: r.MarginPurchaseTodayBalance ?? 0,
    shortBalance: r.ShortSaleTodayBalance ?? 0,
  }));
}

/** 外資持股比例（%）。 */
export async function fetchForeignHolding(
  symbol: string,
  startDate: string,
): Promise<{ date: string; foreignRatio: number }[]> {
  const rows = await finmindGet<ShareholdingRow>({
    dataset: 'TaiwanStockShareholding',
    data_id: symbol,
    start_date: startDate,
  });
  return rows.map((r) => ({ date: r.date, foreignRatio: r.ForeignInvestmentSharesRatio ?? 0 }));
}

/**
 * 載入近 N 日籌碼（合併融資券 + 外資持股），並 upsert StockChip。
 * 任一來源失敗則略過該部分，不整批失敗。
 */
export async function loadChips(symbol: string, days = 30): Promise<ChipDaily[]> {
  const start = new Date(Date.now() - days * 1.6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [margins, foreign] = await Promise.all([
    fetchMarginShort(symbol, start).catch(() => []),
    fetchForeignHolding(symbol, start).catch(() => []),
  ]);

  const byDate = new Map<string, ChipDaily>();
  for (const m of margins) {
    byDate.set(m.date, { date: m.date, marginBalance: m.marginBalance, shortBalance: m.shortBalance, foreignRatio: null });
  }
  for (const f of foreign) {
    const cur = byDate.get(f.date);
    if (cur) cur.foreignRatio = f.foreignRatio;
    else byDate.set(f.date, { date: f.date, marginBalance: 0, shortBalance: 0, foreignRatio: f.foreignRatio });
  }

  const chips = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  for (const c of chips) {
    const tradeDate = new Date(`${c.date}T00:00:00Z`);
    await prisma.stockChip.upsert({
      where: { symbol_tradeDate: { symbol, tradeDate } },
      update: { marginBalance: c.marginBalance, shortBalance: c.shortBalance, foreignRatio: c.foreignRatio },
      create: { symbol, tradeDate, marginBalance: c.marginBalance, shortBalance: c.shortBalance, foreignRatio: c.foreignRatio },
    });
  }
  return chips;
}
