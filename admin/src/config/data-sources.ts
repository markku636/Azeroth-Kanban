/**
 * 股票機器人 — 數據來源中央登錄（單一真實來源）。
 *
 * 供 `<DataSourceTag>` 標籤與「資料來源說明」頁共用，避免來源字串散落各頁。
 * 實際外部來源僅 FinMind / 證交所 TWSE / Claude AI 三類；訊號 / 評分 / 選股器
 * 為本系統依上述數據計算而得，歸為 SYSTEM_SCORE。
 */

/** 數據來源分類。 */
export enum DataSourceKey {
  /** FinMind 開源台股 API（K 線 / 籌碼 / 基本面 / 新聞 / 股名）。 */
  FINMIND = 'FINMIND',
  /** 證交所 TWSE 官方 OpenAPI（漲幅排行 / 加權指數 / 類股）。 */
  TWSE = 'TWSE',
  /** Claude AI（研究報告 / 問答；不提供原始數據）。 */
  AI_CLAUDE = 'AI_CLAUDE',
  /** 本系統依市場數據計算（訊號 / 多因子評分 / 選股器）。 */
  SYSTEM_SCORE = 'SYSTEM_SCORE',
}

/** 單一來源的顯示中繼資料。 */
export interface DataSourceMeta {
  /** 標籤主文字。 */
  label: string;
  /** 計算 / 衍生類來源的底層數據說明（以括號補在 label 後）。 */
  baseNote?: string;
}

/** 來源 Key → 顯示文字對照（標籤元件使用）。 */
export const DATA_SOURCES: Record<DataSourceKey, DataSourceMeta> = {
  [DataSourceKey.FINMIND]: { label: 'FinMind' },
  [DataSourceKey.TWSE]: { label: '證交所 TWSE' },
  [DataSourceKey.AI_CLAUDE]: { label: 'AI（Claude）分析', baseNote: '數據：FinMind / 證交所' },
  [DataSourceKey.SYSTEM_SCORE]: { label: '本系統評分', baseNote: '基於 FinMind / 證交所數據' },
};

/** 「資料來源說明」頁詳細對照表的一列。 */
export interface DataSourceTableRow {
  /** 數據名稱。 */
  data: string;
  /** 來源（可能跨來源，如 'TWSE / FinMind'）。 */
  source: string;
  /** 資料集 / 端點。 */
  dataset: string;
  /** 性質說明。 */
  note: string;
}

/** 「資料來源說明」頁完整對照表（about 頁渲染用）。 */
export const DATA_SOURCE_TABLE: DataSourceTableRow[] = [
  {
    data: '日 K 線 / OHLCV',
    source: 'FinMind',
    dataset: 'TaiwanStockPrice',
    note: '免費，無 token 300/hr、有 token 600/hr',
  },
  {
    data: '三大法人買賣超',
    source: 'FinMind',
    dataset: 'TaiwanStockInstitutionalInvestorsBuySell',
    note: '盤後',
  },
  {
    data: '融資 / 融券餘額',
    source: 'FinMind',
    dataset: 'TaiwanStockMarginPurchaseShortSale',
    note: '盤後',
  },
  { data: '外資持股比例', source: 'FinMind', dataset: 'TaiwanStockShareholding', note: '盤後' },
  {
    data: '月營收（YoY / MoM）',
    source: 'FinMind',
    dataset: 'TaiwanStockMonthRevenue',
    note: '每月約 10 號公布',
  },
  {
    data: '本益比 / 殖利率 / PBR（含估值河流圖歷史）',
    source: 'FinMind',
    dataset: 'TaiwanStockPER',
    note: '每日；估值河流圖取近 3 年逐日序列',
  },
  {
    data: 'EPS（季）',
    source: 'FinMind',
    dataset: 'TaiwanStockFinancialStatements',
    note: '季報',
  },
  { data: '新聞', source: 'FinMind', dataset: 'TaiwanStockNews', note: '盤後（每則另含原始媒體）' },
  {
    data: '股票名稱 / 產業',
    source: 'FinMind',
    dataset: 'TaiwanStockInfo',
    note: '全市場代號對照',
  },
  {
    data: '漲幅排行 / 全市場日成交',
    source: 'TWSE 證交所 OpenAPI',
    dataset: 'STOCK_DAY_ALL',
    note: '免註冊、盤後',
  },
  {
    data: '加權指數 / 類股指數',
    source: 'TWSE OpenAPI / FinMind',
    dataset: 'MI_INDEX / TAIEX',
    note: '盤後',
  },
  {
    data: '美股四大指數（道瓊 / S&P500 / 那斯達克 / 費半）',
    source: 'Yahoo Finance',
    dataset: 'v8/finance/chart（^DJI/^GSPC/^IXIC/^SOX）',
    note: '免費免 key、美股盤後',
  },
  {
    data: '台指期夜盤（近月）',
    source: 'FinMind',
    dataset: 'TaiwanFuturesDaily（TX, after_market）',
    note: '夜盤 15:00–次日 05:00，盤後',
  },
  {
    data: '三大法人台指期未平倉',
    source: 'FinMind',
    dataset: 'TaiwanFuturesInstitutionalInvestors（TX）',
    note: '盤後（外資 / 投信 / 自營商）',
  },
  {
    data: '訊號 / 健診評分 / 選股器',
    source: '本系統計算',
    dataset: '多因子模型（基於上述數據）',
    note: '非原始數據，為系統運算結果',
  },
  {
    data: '研究報告 / 問答',
    source: 'AI（Claude）',
    dataset: 'Claude Agent SDK',
    note: '僅分析撰寫，不提供原始數據',
  },
];
