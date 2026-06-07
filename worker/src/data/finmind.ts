/**
 * FinMind REST 抓取（台股主力資料源，純 fetch，無 SDK）
 *
 * Docs: https://finmind.github.io/quickstart/
 * 免費 token 600 req/hr；無 token 300 req/hr。
 */
import type { StockOhlcv, InstitutionalTrade, ReportSource } from '@azeroth/common';
import { config } from '../config.js';
import type {
  FinMindResponse,
  FinMindPriceRow,
  FinMindNewsRow,
  FinMindInstitutionalRow,
} from './types.js';

const FINMIND_DATASET = {
  PRICE: 'TaiwanStockPrice',
  NEWS: 'TaiwanStockNews',
  INSTITUTIONAL: 'TaiwanStockInstitutionalInvestorsBuySell',
} as const;

/** 帶重試的 FinMind GET。429/5xx 退避重試。 */
export async function finmindGet<T>(params: Record<string, string>): Promise<T[]> {
  const url = new URL(config.finmind.baseUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (config.finmind.token) url.searchParams.set('token', config.finmind.token);

  const maxRetries = 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`FinMind HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw new Error(`FinMind HTTP ${res.status}: ${await res.text()}`);
      }
      const json = (await res.json()) as FinMindResponse<T>;
      if (json.status !== 200) {
        throw new Error(`FinMind status ${json.status}: ${json.msg}`);
      }
      return json.data ?? [];
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        const delay = 500 * 2 ** attempt + Math.floor(attempt * 137); // 退避 + 微抖動
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw new Error(`FinMind 連線失敗（已重試 ${maxRetries} 次）：${(lastErr as Error)?.message}`);
}

/** 取日 K（OHLCV），正規化為共用 StockOhlcv。 */
export async function fetchDailyKline(
  symbol: string,
  startDate: string,
  endDate: string,
): Promise<StockOhlcv[]> {
  const rows = await finmindGet<FinMindPriceRow>({
    dataset: FINMIND_DATASET.PRICE,
    data_id: symbol,
    start_date: startDate,
    end_date: endDate,
  });
  return rows
    .map((r) => ({
      date: r.date,
      open: r.open,
      high: r.max,
      low: r.min,
      close: r.close,
      volume: r.Trading_Volume,
    }))
    .filter((o) => Number.isFinite(o.close) && o.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 取個股近期新聞，轉為報告來源格式。
 * 注意：FinMind 的 TaiwanStockNews 資料量大，**不可傳 end_date**
 * （否則回 400），只送 start_date 取該起始日起的新聞。
 */
export async function fetchStockNews(
  symbol: string,
  startDate: string,
  _endDate?: string,
): Promise<ReportSource[]> {
  const rows = await finmindGet<FinMindNewsRow>({
    dataset: FINMIND_DATASET.NEWS,
    data_id: symbol,
    start_date: startDate,
  });
  return rows.map((r) => ({
    title: r.title,
    url: r.link,
    publisher: r.source,
    publishedAt: r.date,
  }));
}

/** 取三大法人買賣超（彙整為淨額）。 */
export async function fetchInstitutionalTrades(
  symbol: string,
  startDate: string,
  endDate: string,
): Promise<InstitutionalTrade[]> {
  const rows = await finmindGet<FinMindInstitutionalRow>({
    dataset: FINMIND_DATASET.INSTITUTIONAL,
    data_id: symbol,
    start_date: startDate,
    end_date: endDate,
  });
  return rows.map((r) => ({
    date: r.date,
    symbol: r.stock_id,
    name: r.name,
    buy: r.buy,
    sell: r.sell,
    net: r.buy - r.sell,
  }));
}
