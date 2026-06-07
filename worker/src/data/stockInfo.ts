/**
 * 股票基本資料（代號 → 名稱 / 產業）。FinMind TaiwanStockInfo（免費，全市場一次抓）。
 */
import { prisma } from '../db.js';
import { finmindGet } from './finmind.js';
import { log } from '../logger.js';

interface InfoRow {
  stock_id: string;
  stock_name: string;
  industry_category: string;
}

/** 一次抓全市場代號→名稱，去重後重建 StockInfo。回傳筆數。 */
export async function loadAllStockInfo(): Promise<number> {
  const rows = await finmindGet<InfoRow>({ dataset: 'TaiwanStockInfo' });
  // 同代號可能多筆（不同產業分類），保留最後一筆；只收 4 位數一般股票 + ETF 等
  const byId = new Map<string, InfoRow>();
  for (const r of rows) {
    if (!r.stock_id || !r.stock_name) continue;
    byId.set(r.stock_id, r);
  }
  const data = [...byId.values()].map((r) => ({
    symbol: r.stock_id,
    name: r.stock_name,
    industry: r.industry_category || null,
  }));

  await prisma.$transaction([
    prisma.stockInfo.deleteMany({}),
    prisma.stockInfo.createMany({ data, skipDuplicates: true }),
  ]);
  log.info('stock info loaded', { count: data.length });
  return data.length;
}

/** 確保單一代號的名稱已入庫（缺則補抓）。 */
export async function ensureStockName(symbol: string): Promise<void> {
  const exists = await prisma.stockInfo.findUnique({ where: { symbol } });
  if (exists) return;
  try {
    const rows = await finmindGet<InfoRow>({ dataset: 'TaiwanStockInfo', data_id: symbol });
    const r = rows[0];
    if (r?.stock_name) {
      await prisma.stockInfo.upsert({
        where: { symbol },
        update: { name: r.stock_name, industry: r.industry_category || null },
        create: { symbol, name: r.stock_name, industry: r.industry_category || null },
      });
    }
  } catch (e) {
    log.warn('ensureStockName 失敗', { symbol, error: (e as Error).message });
  }
}
