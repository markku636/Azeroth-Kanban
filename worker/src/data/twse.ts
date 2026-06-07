/**
 * TWSE OpenAPI 抓取（免 key、盤後資料）
 *
 * Docs / Swagger: https://openapi.twse.com.tw/
 * STOCK_DAY_ALL：當日所有上市個股成交資訊（盤後）。
 */
import type { TopGainer } from '@azeroth/common';

const TWSE_STOCK_DAY_ALL =
  'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';

/** STOCK_DAY_ALL 單筆原始格式（欄位為字串，含千分位逗號） */
interface TwseStockDayAllRow {
  Code: string;
  Name: string;
  TradeVolume: string;
  TradeValue: string;
  OpeningPrice: string;
  HighestPrice: string;
  LowestPrice: string;
  ClosingPrice: string;
  Change: string;
  Transaction: string;
}

function toNum(s: string | undefined): number {
  if (!s) return NaN;
  const n = Number(s.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

/**
 * 取當日漲幅排行（盤後）。
 * TWSE 只提供 Change（漲跌價），漲跌幅 = Change / (Close - Change) * 100。
 *
 * @param limit 取前幾名
 * @param minVolume 最低成交量（股）過濾冷門股，預設 100 萬股
 */
export async function fetchTopGainers(limit = 20, minVolume = 1_000_000): Promise<TopGainer[]> {
  const res = await fetch(TWSE_STOCK_DAY_ALL, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`TWSE STOCK_DAY_ALL HTTP ${res.status}`);
  }
  const rows = (await res.json()) as TwseStockDayAllRow[];

  const gainers: TopGainer[] = [];
  for (const r of rows) {
    // 只取一般上市股票（4 位數代號）
    if (!/^\d{4}$/.test(r.Code)) continue;

    const close = toNum(r.ClosingPrice);
    const change = toNum(r.Change);
    const volume = toNum(r.TradeVolume);
    const prevClose = close - change;
    if (!Number.isFinite(close) || !Number.isFinite(change) || prevClose <= 0) continue;
    if (!Number.isFinite(volume) || volume < minVolume) continue;

    const changePercent = (change / prevClose) * 100;
    if (changePercent <= 0) continue;

    gainers.push({
      symbol: r.Code,
      name: r.Name,
      close,
      changePercent: Math.round(changePercent * 100) / 100,
      volume,
    });
  }

  return gainers
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, limit);
}
