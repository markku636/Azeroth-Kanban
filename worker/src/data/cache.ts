/**
 * 日 K 本地快取（StockDailyPrice）。
 * 減少重複打 FinMind/TWSE，並為回測保留歷史。
 */
import type { StockOhlcv } from '@azeroth/common';
import { prisma } from '../db.js';
import { fetchDailyKline } from './finmind.js';

/** 將共用 OHLCV 寫入快取（upsert，依 symbol+tradeDate 去重）。 */
export async function upsertDailyPrices(
  symbol: string,
  ohlcv: StockOhlcv[],
  source = 'finmind',
): Promise<number> {
  let count = 0;
  for (const o of ohlcv) {
    const tradeDate = new Date(`${o.date}T00:00:00Z`);
    await prisma.stockDailyPrice.upsert({
      where: { symbol_tradeDate: { symbol, tradeDate } },
      update: {
        open: o.open,
        high: o.high,
        low: o.low,
        close: o.close,
        volume: BigInt(Math.round(o.volume)),
        source,
      },
      create: {
        symbol,
        tradeDate,
        open: o.open,
        high: o.high,
        low: o.low,
        close: o.close,
        volume: BigInt(Math.round(o.volume)),
        source,
      },
    });
    count++;
  }
  return count;
}

/** 從快取讀取日 K（升冪），可選日期範圍。 */
export async function getCachedKline(
  symbol: string,
  startDate?: string,
  endDate?: string,
): Promise<StockOhlcv[]> {
  const where: { symbol: string; tradeDate?: { gte?: Date; lte?: Date } } = { symbol };
  if (startDate || endDate) {
    where.tradeDate = {};
    if (startDate) where.tradeDate.gte = new Date(`${startDate}T00:00:00Z`);
    if (endDate) where.tradeDate.lte = new Date(`${endDate}T00:00:00Z`);
  }
  const rows = await prisma.stockDailyPrice.findMany({
    where,
    orderBy: { tradeDate: 'asc' },
  });
  return rows.map((r) => ({
    date: r.tradeDate.toISOString().slice(0, 10),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: Number(r.volume),
  }));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 載入近 N 日 K：先讀快取，不足則向 FinMind 抓取並回填快取。
 * @param days 需要的交易日數（會多抓日曆天以涵蓋假日）
 */
export async function loadKline(symbol: string, days = 120): Promise<StockOhlcv[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 1.6 * 24 * 60 * 60 * 1000);
  const startStr = isoDate(start);
  const endStr = isoDate(end);

  const cached = await getCachedKline(symbol, startStr, endStr);
  // 快取足量（涵蓋至近 5 天內）即直接用
  if (cached.length >= Math.min(days, 60)) {
    const latest = cached[cached.length - 1]?.date;
    if (latest && new Date(`${latest}T00:00:00Z`).getTime() > end.getTime() - 5 * 24 * 60 * 60 * 1000) {
      return cached;
    }
  }

  // 否則抓取並回填
  const fresh = await fetchDailyKline(symbol, startStr, endStr);
  if (fresh.length) {
    await upsertDailyPrices(symbol, fresh);
    return fresh;
  }
  return cached;
}

/** 兩個 YYYY-MM-DD 的日曆天數差（b − a）。 */
function dayDiff(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

/**
 * 判斷快取是否足以涵蓋指定區間（供回測使用）：
 *  - 非空
 *  - 筆數達該區間預估交易日的 6 成以上（避免只有近期 ~120 天卻要 5 年的情況）
 *  - 最新資料距 endDate 不超過 7 天（近段不過時）
 */
function hasAdequateCoverage(cached: StockOhlcv[], startDate: string, endDate: string): boolean {
  if (cached.length === 0) {
    return false;
  }
  const spanDays = Math.max(1, dayDiff(startDate, endDate));
  const expectedTradingDays = (spanDays * 5) / 7;
  if (cached.length < expectedTradingDays * 0.6) {
    return false;
  }
  const last = cached[cached.length - 1].date;
  return dayDiff(last, endDate) <= 7;
}

/**
 * 載入指定日期區間的日 K（供回測，可跨多年）。
 * 先讀快取，涵蓋不足則向 FinMind 抓整段並回填，再回傳合併後的快取。
 * @param startDate YYYY-MM-DD（含）
 * @param endDate   YYYY-MM-DD（含）
 */
export async function loadKlineRange(
  symbol: string,
  startDate: string,
  endDate: string,
): Promise<StockOhlcv[]> {
  let cached = await getCachedKline(symbol, startDate, endDate);
  if (hasAdequateCoverage(cached, startDate, endDate)) {
    return cached;
  }
  const fresh = await fetchDailyKline(symbol, startDate, endDate);
  if (fresh.length) {
    await upsertDailyPrices(symbol, fresh);
    cached = await getCachedKline(symbol, startDate, endDate);
  }
  return cached;
}
