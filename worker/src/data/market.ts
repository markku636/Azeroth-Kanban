/**
 * 大盤 / 類股輪動資料層（全免費）。
 *  - 加權指數 OHLC：FinMind TaiwanStockPrice(data_id=TAIEX)
 *  - 大盤漲跌% + 類股指數漲跌%：TWSE MI_INDEX
 *  - 漲跌家數（市場廣度）：TWSE STOCK_DAY_ALL（Change 已帶正負號）
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { fetchDailyKline } from './finmind.js';
import { log } from '../logger.js';

const TWSE_MI_INDEX = 'https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX';
const TWSE_STOCK_DAY_ALL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';

const TAIEX_INDEX_NAME = '發行量加權股價指數';
const SECTOR_SUFFIX = '類指數';

/**
 * TWSE 複合（roll-up）類股指數：本身彙整其他已在清單中的成分類股，
 * 與成分類股同列會造成重複計算與排行失真，類股輪動排行時排除。
 * （名稱為去掉「類指數」後綴後的值）
 */
const COMPOSITE_SECTORS = new Set(['塑膠化工', '機電', '化學生技醫療']);

interface MiIndexRow {
  日期: string;
  指數: string;
  收盤指數: string;
  漲跌: string;
  漲跌點數: string;
  漲跌百分比: string;
}
interface StockDayAllRow {
  Code: string;
  Change: string;
}

export interface SectorChange {
  name: string;
  changePct: number;
}
export interface MarketSnapshot {
  date: Date;
  taiexOpen: number | null;
  taiexHigh: number | null;
  taiexLow: number | null;
  taiexClose: number | null;
  taiexChangePct: number | null;
  advancers: number;
  decliners: number;
  unchanged: number;
  sectors: SectorChange[];
}

function toNum(s: string | undefined): number {
  if (!s) return NaN;
  const n = Number(s.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

/** 依「漲跌」方向（+/-）給漲跌百分比正負號。 */
function signedPct(dir: string | undefined, pctStr: string | undefined): number {
  const raw = toNum(pctStr);
  if (!Number.isFinite(raw)) return 0;
  return dir?.trim() === '-' ? -Math.abs(raw) : Math.abs(raw);
}

/** 解析 TWSE 民國日期（如 "1150605" → 2026-06-05 UTC）。失敗回今天。 */
function parseRocDate(roc: string | undefined): Date {
  if (roc && /^\d{7}$/.test(roc)) {
    const year = Number(roc.slice(0, 3)) + 1911;
    const month = Number(roc.slice(3, 5));
    const day = Number(roc.slice(5, 7));
    return new Date(Date.UTC(year, month - 1, day));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const TAIEX_LOOKBACK_DAYS = 14;

/** FinMind 取加權指數近 N 日 OHLC，回傳最新一筆（含日期，供與 MI_INDEX 對齊）。 */
async function fetchTaiexOhlc(): Promise<{
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
} | null> {
  const end = new Date();
  const start = new Date(end.getTime() - TAIEX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const rows = await fetchDailyKline('TAIEX', startStr, endStr);
  const last = rows[rows.length - 1];
  if (!last) return null;
  return { date: last.date, open: last.open, high: last.high, low: last.low, close: last.close };
}

/** TWSE MI_INDEX：取大盤（加權指數）+ 類股指數漲跌%。 */
async function fetchMarketIndex(): Promise<{
  date: Date;
  taiexClose: number | null;
  taiexChangePct: number | null;
  sectors: SectorChange[];
}> {
  const res = await fetch(TWSE_MI_INDEX, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`TWSE MI_INDEX HTTP ${res.status}`);
  const rows = (await res.json()) as MiIndexRow[];
  // 空資料（非交易日 / 維護 / 暫時性錯誤）→ 大聲失敗，不靜默寫今日空列
  if (!rows.length) throw new Error('TWSE MI_INDEX 回傳空資料');

  let date = parseRocDate(rows[0]?.日期);
  let taiexClose: number | null = null;
  let taiexChangePct: number | null = null;
  const sectors: SectorChange[] = [];

  for (const r of rows) {
    const name = r.指數?.trim() ?? '';
    if (name === TAIEX_INDEX_NAME) {
      date = parseRocDate(r.日期);
      const close = toNum(r.收盤指數);
      taiexClose = Number.isFinite(close) ? close : null;
      taiexChangePct = signedPct(r.漲跌, r.漲跌百分比);
      continue;
    }
    // 類股價格指數（endsWith 類指數 已自動排除「報酬指數 / 槓桿 / 反向」）
    if (name.endsWith(SECTOR_SUFFIX)) {
      const sectorName = name.slice(0, -SECTOR_SUFFIX.length);
      // 排除複合 roll-up 類股，避免與成分類股重複計算
      if (COMPOSITE_SECTORS.has(sectorName)) continue;
      sectors.push({
        name: sectorName,
        changePct: Math.round(signedPct(r.漲跌, r.漲跌百分比) * 100) / 100,
      });
    }
  }

  // 找不到加權指數列 = 頭條資料缺失 → 大聲失敗，不寫入殘缺快照
  if (taiexClose === null) {
    throw new Error('TWSE MI_INDEX 找不到「發行量加權股價指數」列');
  }

  sectors.sort((a, b) => b.changePct - a.changePct);
  return { date, taiexClose, taiexChangePct, sectors };
}

interface Breadth {
  advancers: number;
  decliners: number;
  unchanged: number;
}

/** TWSE STOCK_DAY_ALL：算漲跌家數（市場廣度）。 */
async function fetchBreadth(): Promise<Breadth> {
  const res = await fetch(TWSE_STOCK_DAY_ALL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`TWSE STOCK_DAY_ALL HTTP ${res.status}`);
  const rows = (await res.json()) as StockDayAllRow[];

  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;
  for (const r of rows) {
    if (!/^\d{4}$/.test(r.Code)) continue;
    const change = toNum(r.Change);
    if (!Number.isFinite(change)) continue;
    if (change > 0) advancers++;
    else if (change < 0) decliners++;
    else unchanged++;
  }
  return { advancers, decliners, unchanged };
}

/** 抓取大盤快照（合併三來源），不落庫。 */
export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  const [index, breadth, ohlc] = await Promise.all([
    fetchMarketIndex(),
    fetchBreadth(),
    fetchTaiexOhlc().catch(() => null),
  ]);
  // 只在 FinMind OHLC 與 MI_INDEX 為同一交易日時才採用，避免拼出跨日的無效 K 棒
  const indexDateStr = index.date.toISOString().slice(0, 10);
  const ohlcAligned = ohlc && ohlc.date === indexDateStr ? ohlc : null;
  if (ohlc && !ohlcAligned) {
    log.warn('TAIEX OHLC 日期與 MI_INDEX 不一致，略過 OHLC', {
      ohlcDate: ohlc.date,
      indexDate: indexDateStr,
    });
  }
  return {
    date: index.date,
    taiexOpen: ohlcAligned?.open ?? null,
    taiexHigh: ohlcAligned?.high ?? null,
    taiexLow: ohlcAligned?.low ?? null,
    taiexClose: index.taiexClose ?? ohlcAligned?.close ?? null,
    taiexChangePct: index.taiexChangePct,
    advancers: breadth.advancers,
    decliners: breadth.decliners,
    unchanged: breadth.unchanged,
    sectors: index.sectors,
  };
}

/** 抓取並 upsert 當日大盤快照。回傳快照。 */
export async function loadMarket(): Promise<MarketSnapshot> {
  const snap = await fetchMarketSnapshot();
  const data = {
    taiexOpen: snap.taiexOpen,
    taiexHigh: snap.taiexHigh,
    taiexLow: snap.taiexLow,
    taiexClose: snap.taiexClose,
    taiexChangePct: snap.taiexChangePct,
    advancers: snap.advancers,
    decliners: snap.decliners,
    unchanged: snap.unchanged,
    sectors: snap.sectors as unknown as Prisma.InputJsonValue,
  };
  await prisma.marketDaily.upsert({
    where: { date: snap.date },
    update: data,
    create: { date: snap.date, ...data },
  });
  log.info('market loaded', {
    date: snap.date.toISOString().slice(0, 10),
    taiexChangePct: snap.taiexChangePct,
    advancers: snap.advancers,
    decliners: snap.decliners,
    sectors: snap.sectors.length,
  });
  return snap;
}
