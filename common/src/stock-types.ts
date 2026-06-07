/**
 * 股票 AI 機器人 — 跨 workspace 共用型別
 *
 * 設計：純型別 + 常數，不依賴 Prisma / Next.js / Node API，
 * 讓 `common`、`admin`、`worker` 三方共用同一份契約。
 */

/** 單日 K 線（正規化後的內部格式） */
export interface StockOhlcv {
  /** 交易日 YYYY-MM-DD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** 成交量（股） */
  volume: number;
}

/** 技術指標計算結果（取序列尾端代表值 + 完整序列供畫圖） */
export interface StockIndicators {
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  ema12: number | null;
  ema26: number | null;
  rsi14: number | null;
  macd: { macd: number | null; signal: number | null; histogram: number | null };
  kd: { k: number | null; d: number | null };
  bollinger: { upper: number | null; middle: number | null; lower: number | null };
  /** 量能比：當日量 / 近 20 日均量 */
  volumeRatio: number | null;

  // ─── 趨勢動能（WP-A）───
  /** DMI/ADX：plusDi=+DI、minusDi=-DI、adx 趨勢強度（>25 視為有趨勢） */
  dmi: { plusDi: number | null; minusDi: number | null; adx: number | null };
  /** 威廉指標 %R（−100~0；< −80 超賣、> −20 超買） */
  williamsR: number | null;
  /** 順勢指標 CCI（±100 為常用界） */
  cci: number | null;
  /** 能量潮 OBV 尾值 + 近 5 日趨勢方向 */
  obv: { value: number | null; trend: 'up' | 'down' | 'flat' | null };
  /** 乖離率（%）：(close − MAn)/MAn */
  bias: { bias5: number | null; bias10: number | null; bias20: number | null };
  /** 拋物線 SAR 停損參考值 + 多空位置（價在 SAR 上=多） */
  sar: { value: number | null; position: 'long' | 'short' | null };
  /** 各類背離旗標（true=偵測到，近端 swing 高低點比較） */
  divergence: {
    macdBullish: boolean;
    macdBearish: boolean;
    rsiBullish: boolean;
    rsiBearish: boolean;
    /** 量價背離（以 OBV 為量能代理） */
    volumeBullish: boolean;
    volumeBearish: boolean;
  };
  /** 半年線（120 日） */
  ma120: number | null;
  /** 年線（240 日） */
  ma240: number | null;
}

/** 偵測到的 K 線型態 */
export interface CandlePattern {
  /** 型態代碼，如 'hammer'、'bullishEngulfing' */
  code: string;
  /** 多空方向 */
  bias: 'bullish' | 'bearish' | 'neutral';
}

/** 買賣動作 */
export type SignalAction = 'BUY' | 'SELL' | 'HOLD';

/** 完整買賣訊號（agent / 規則引擎的結構化輸出） */
export interface TradeSignal {
  symbol: string;
  /** 交易日 YYYY-MM-DD */
  date: string;
  action: SignalAction;
  /** 建議進場區間，如 "925~930" */
  entryZone?: string;
  stopLoss?: number;
  takeProfit?: number;
  /** 進出場時機說明 */
  timingNote?: string;
  /** 0~1 信心分數 */
  confidence: number;
  /** 研判理由（自然語言） */
  rationale: string;
  patterns: CandlePattern[];
  indicators: StockIndicators;
}

/** 研究報告引用來源 */
export interface ReportSource {
  title: string;
  url: string;
  /** 來源名稱，如 '鉅亨網' */
  publisher?: string;
  /** 發布時間 ISO 字串 */
  publishedAt?: string;
}

/** 研究報告 DTO */
export interface ResearchReportDto {
  symbol: string;
  /** 報告日 YYYY-MM-DD */
  reportDate: string;
  title: string;
  summary: string;
  /** Markdown 全文 */
  body: string;
  sources: ReportSource[];
  /** 綜合情緒：positive / neutral / negative */
  sentiment?: 'positive' | 'neutral' | 'negative';
}

/** 大盤 AI 盤勢解讀報告 DTO */
export interface MarketReportDto {
  /** 報告日 YYYY-MM-DD */
  reportDate: string;
  title: string;
  summary: string;
  /** Markdown 全文 */
  body: string;
  /** 綜合方向：bullish / neutral / bearish */
  sentiment?: 'bullish' | 'neutral' | 'bearish';
  /** true = 降級資料摘要版（Claude 不可用時，未經 AI 深度研判） */
  degraded: boolean;
}

/** 漲幅排行單筆 */
export interface TopGainer {
  symbol: string;
  name: string;
  close: number;
  /** 漲跌幅（%） */
  changePercent: number;
  volume: number;
}

/** 單日籌碼（融資券 + 外資持股） */
export interface ChipDaily {
  /** 交易日 YYYY-MM-DD */
  date: string;
  /** 融資餘額（張） */
  marginBalance: number;
  /** 融券餘額（張） */
  shortBalance: number;
  /** 外資持股比例（%） */
  foreignRatio: number | null;
}

/** 基本面 DTO */
export interface StockFundamentalDto {
  /** 最新月營收所屬期間 YYYY-MM */
  revenuePeriod: string | null;
  /** 最新月營收（元） */
  revenue: number | null;
  /** 營收年增率（%） */
  revenueYoy: number | null;
  /** 營收月增率（%） */
  revenueMom: number | null;
  /** 最新季 EPS（元） */
  eps: number | null;
  /** 本益比 */
  per: number | null;
  /** 股價淨值比 */
  pbr: number | null;
  /** 殖利率（%） */
  dividendYield: number | null;
}

/** 多因子評分的因子穩定識別碼（程式比對用，永不在地化） */
export type ScoreFactorKey = 'chips' | 'tech' | 'fund' | 'momentum' | 'valuation';

/** 內建評分策略 preset id */
export type ScoringStrategyId = 'balanced' | 'value' | 'momentum' | 'chips' | 'dividend';

/** 每因子權重組（各值 0~1，加總應為 1） */
export type StrategyWeights = Record<ScoreFactorKey, number>;

/**
 * 多因子評分單一因子（worker 落庫的「未加權」原始子分數）。
 * 權重不在此固定，改由 read-time 套策略決定。
 */
export interface ScoreFactor {
  /** 穩定識別碼（取代脆弱的 name 比對） */
  key: ScoreFactorKey;
  /** 顯示名稱（在地化字串，如 '籌碼面'） */
  name: string;
  /** 0~100 原始子分數 */
  score: number;
  /** 評分理由 */
  reason: string;
  /**
   * @deprecated 權重改由 read-time 套策略提供；落庫時可寫入預設策略權重僅供舊頁相容。
   */
  weight?: number;
}

/** worker 落庫的評分明細（存於 AnalysisSignal.scoreDetail，無 total / 無正式權重） */
export interface ScoreDetail {
  /** schema 版本，向後相容判斷用 */
  version: 2;
  factors: ScoreFactor[];
}

/** read-time 加權後的單一因子（含該策略權重與加權後分數） */
export interface WeightedScoreFactor extends ScoreFactor {
  /** 本次策略下的權重 0~1 */
  weight: number;
  /** score * weight */
  weighted: number;
}

/** read-time 加權結果（含 total，回傳前端） */
export interface StockScore {
  /** 0~100 加權總分 */
  total: number;
  /** 本次加權所用策略（自訂權重為 'custom'） */
  strategyId: ScoringStrategyId | 'custom';
  factors: WeightedScoreFactor[];
}

/** 三大法人買賣超單筆（張） */
export interface InstitutionalTrade {
  date: string;
  symbol: string;
  /** 投信 / 外資 / 自營商 */
  name: string;
  buy: number;
  sell: number;
  /** 買賣超淨額 */
  net: number;
}

/**
 * 多週期 KD 紅綠燈（給小白看的「該不該買」白話結論）
 *
 * 抄三竹「月線看大方向、60 分鐘看切入點」的 KD 黃線（D 慢線）方向法，
 * 但本專案只有日線資料：大方向用月 KD（不足退週 KD）、切入點用日 KD 替代 60 分鐘。
 * 燈號採「號誌語意」：green=可買、red=別買、yellow=過熱別追、gray=資料不足。
 */
export type KdLightColor = 'green' | 'red' | 'yellow' | 'gray';

/** 大方向燈（月 KD，月線資料不足時自動退回週 KD） */
export interface KdDirectionLight {
  color: KdLightColor;
  /** 實際採用的週期；none = 連週線都算不出 */
  basis: 'month' | 'week' | 'none';
  /** 黃線（D 慢線）值 */
  dValue: number | null;
  /** 黃線是否向上（前一筆 D < 當前 D） */
  dRising: boolean | null;
  /** D 位階：high=過熱(≥80) / low=低檔(≤20) / mid=中段 */
  zone: 'high' | 'low' | 'mid';
  /** 白話標籤，如「偏多，可找買點」 */
  label: string;
}

/** 切入點燈（日 KD，替代三竹 60 分鐘線） */
export interface KdEntryLight {
  color: KdLightColor;
  dValue: number | null;
  dRising: boolean | null;
  /** 白話標籤，如「短線轉強，可切入」 */
  label: string;
}

/** 多週期 KD 紅綠燈綜合結論（卡片直接呈現） */
export interface KdVerdict {
  direction: KdDirectionLight;
  entryTiming: KdEntryLight;
  /** 綜合等級，決定卡片整體色調：buy=可買 / wait=先等 / avoid=別買 / unknown=資料不足 */
  level: 'buy' | 'wait' | 'avoid' | 'unknown';
  /** 一句話結論 */
  headline: string;
  /** 一個行動建議 */
  action: string;
  /** 資料品質提示（如「月線資料不足，已改用週線判斷」） */
  confidenceNote: string;
  /** 免責聲明（= STOCK_DISCLAIMER） */
  disclaimer: string;
  /** 降級狀態 */
  degraded: 'none' | 'usedWeek' | 'insufficient' | 'kdNull';
}

/** 美股指數單筆（國際盤看板用） */
export interface UsIndexQuote {
  /** Yahoo symbol，如 ^DJI / ^GSPC / ^IXIC / ^SOX */
  symbol: string;
  /** 顯示名稱，如 'Dow Jones Industrial Average' */
  name: string;
  /** 收盤價 */
  close: number;
  /** 漲跌%（對前一交易日） */
  changePct: number | null;
  /** 漲跌點（對前一交易日） */
  changePoint: number | null;
  /** 對應美股交易日 YYYY-MM-DD */
  asOf: string | null;
}

/** 單一法人台指期未平倉淨部位（口數） */
export interface FuturesInstitutionOi {
  /** 多方未平倉口數 */
  longOi: number;
  /** 空方未平倉口數 */
  shortOi: number;
  /** 淨未平倉口數 = 多 − 空（正 = 偏多、負 = 偏空） */
  netOi: number;
}

/** 三大法人台指期未平倉（盤後籌碼） */
export interface FuturesChip {
  /** 資料日 YYYY-MM-DD */
  date: string;
  /** 外資 */
  foreign: FuturesInstitutionOi;
  /** 投信 */
  trust: FuturesInstitutionOi;
  /** 自營商 */
  dealer: FuturesInstitutionOi;
}

/** 國際盤 / 期貨夜盤看板資料（GET /api/v1/stock/global 回傳） */
export interface GlobalMarketData {
  /** 抓取日 YYYY-MM-DD */
  date: string;
  /** 美股四大指數 */
  usIndices: UsIndexQuote[];
  /** 台指期夜盤 */
  txfNight: {
    /** 夜盤（近月）收盤 */
    close: number | null;
    /** 夜盤漲跌%（vs 日盤結算） */
    changePct: number | null;
    /** 夜盤漲跌點（vs 日盤結算） */
    changePoint: number | null;
    /** 期現價差(基差) = 夜盤收盤 − 加權指數收盤 */
    basis: number | null;
  };
  /** 三大法人台指期未平倉 */
  futChips: FuturesChip | null;
}

/** 背景 Job 類型 */
export const StockJobType = {
  ANALYSIS: 'analysis',
  RESEARCH: 'research',
  DIGEST: 'digest',
  LINE_PUSH: 'line-push',
  QA: 'qa',
  SCREEN: 'screen',
  MARKET: 'market',
  GLOBAL: 'global',
  MARKET_REPORT: 'market-report',
  BACKTEST: 'backtest',
  BACKTEST_BATCH: 'backtest-batch',
} as const;
export type StockJobTypeValue = (typeof StockJobType)[keyof typeof StockJobType];

/** 統一免責聲明（所有訊號 / 報告附帶） */
export const STOCK_DISCLAIMER =
  '⚠️ 本內容由 AI 自動產生，僅供資訊參考，非投資建議，不保證準確或獲利，投資請自負風險。';
