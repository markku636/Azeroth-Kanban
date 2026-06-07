/**
 * admin 端最小 FinMind client。
 *
 * admin 平常只讀 DB cache（由 worker 回填），不直接打 FinMind；
 * 唯一例外是「手動分析/研究」前的代號存在性驗證——需要權威來源判斷
 * 代號是否為真實上市櫃標的（本地 StockInfo 只含分析過的代號，不可靠）。
 */
const FINMIND_BASE_URL = process.env.FINMIND_BASE_URL ?? 'https://api.finmindtrade.com/api/v4/data';
const FINMIND_TOKEN = process.env.FINMIND_TOKEN ?? '';
const DATASET_STOCK_INFO = 'TaiwanStockInfo';

interface FinMindResponse<T> {
  status: number;
  msg: string;
  data?: T[];
}

interface StockInfoRow {
  stock_id: string;
  stock_name: string;
  industry_category: string;
}

export interface ListedStockInfo {
  name: string;
  industry: string | null;
}

/**
 * 查 FinMind TaiwanStockInfo 判斷代號是否存在。
 * @returns 存在則回 `{ name, industry }`；代號不存在（回 0 筆）則回 `null`
 * @throws 網路或 API 失敗時 throw（屬基礎設施問題，交由呼叫端決定降級）
 */
export async function fetchStockInfoFromFinMind(symbol: string): Promise<ListedStockInfo | null> {
  const url = new URL(FINMIND_BASE_URL);
  url.searchParams.set('dataset', DATASET_STOCK_INFO);
  url.searchParams.set('data_id', symbol);
  if (FINMIND_TOKEN) {
    url.searchParams.set('token', FINMIND_TOKEN);
  }

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`FinMind HTTP ${res.status}`);
  }
  const json = (await res.json()) as FinMindResponse<StockInfoRow>;
  if (json.status !== 200) {
    throw new Error(`FinMind status ${json.status}: ${json.msg}`);
  }

  const row = json.data?.[0];
  if (!row?.stock_name) {
    return null;
  }
  return { name: row.stock_name, industry: row.industry_category || null };
}
