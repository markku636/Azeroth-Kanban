/**
 * 美股指數資料層（Yahoo Finance v8 chart，免 API key）。
 *  - 道瓊 ^DJI、S&P500 ^GSPC、那斯達克 ^IXIC、費城半導體 ^SOX
 *  - 取最近兩根日 K 算漲跌；任一 symbol 失敗只略過該檔，不影響其他。
 */
import type { UsIndexQuote } from '@azeroth/common';
import { log } from '../logger.js';

const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
/** Yahoo 會擋預設（node）UA，需帶瀏覽器 UA 才回 200。 */
const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

/** 美股四大指數（陣列順序即看板顯示順序）。 */
const US_INDEX_SYMBOLS: readonly string[] = ['^DJI', '^GSPC', '^IXIC', '^SOX'];

interface YahooChartMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  shortName?: string;
  regularMarketTime?: number;
}
interface YahooChartResult {
  meta?: YahooChartMeta;
  indicators?: { quote?: { close?: (number | null)[] }[] };
}
interface YahooChartResponse {
  chart?: { result?: YahooChartResult[]; error?: unknown };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 取單一指數最新報價（最近兩根日 K 算漲跌）。失敗回 null。 */
async function fetchOneIndex(symbol: string): Promise<UsIndexQuote | null> {
  try {
    const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': YAHOO_UA, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Yahoo HTTP ${res.status}`);
    }
    const json = (await res.json()) as YahooChartResponse;
    const result = json.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) {
      throw new Error('Yahoo chart 回傳無 meta');
    }

    // 過濾掉 null 的日 K close（假日 / 進行中尚未成形的 bar）
    const closes = (result?.indicators?.quote?.[0]?.close ?? []).filter(
      (c): c is number => c != null && Number.isFinite(c),
    );
    // 收盤優先取 regularMarketPrice（最新），退回最後一根有效 bar
    const last = meta.regularMarketPrice ?? closes[closes.length - 1] ?? null;
    // 前一交易日收盤：倒數第二根有效 bar；不足時退回 meta.chartPreviousClose
    const prev = closes.length >= 2 ? closes[closes.length - 2] : (meta.chartPreviousClose ?? null);
    if (last == null) {
      throw new Error('Yahoo 無有效收盤價');
    }

    const changePoint = prev != null ? round2(last - prev) : null;
    const changePct = prev != null && prev !== 0 ? round2(((last - prev) / prev) * 100) : null;
    const asOf = meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
      : null;

    return {
      symbol,
      name: meta.shortName ?? symbol,
      close: round2(last),
      changePct,
      changePoint,
      asOf,
    };
  } catch (e) {
    log.warn('美股指數抓取失敗', { symbol, error: (e as Error).message });
    return null;
  }
}

/** 抓美股四大指數（平行；個別失敗略過，全失敗回空陣列）。 */
export async function fetchUsIndices(): Promise<UsIndexQuote[]> {
  const results = await Promise.all(US_INDEX_SYMBOLS.map((s) => fetchOneIndex(s)));
  return results.filter((r): r is UsIndexQuote => r !== null);
}
