/**
 * KD 策略回測型別（單一個股、多單、單一持倉、複利）。
 *
 * 策略訊號與 K 線圖上的買/賣箭頭（admin `kd-verdict.ts` 的 computeKdMarkers）同一套
 * 「快速 KD + 黃金/死亡交叉」邏輯，讓回測結果對得上使用者看到的圖。
 */

/** 回測可調參數（皆有預設值，前端可覆寫）。 */
export interface BacktestParams {
  /** KD 計算週期（預設 9，台股經典） */
  kdPeriod: number;
  /** KD 信號平滑期（D 線，預設 3） */
  kdSignal: number;
  /** 買進門檻：低檔黃金交叉且 K < 此值（預設 40，與 K 線圖箭頭一致；教科書版用 20） */
  buyBelow: number;
  /** 賣出門檻：高檔死亡交叉且 K > 此值（預設 60；教科書版用 80） */
  sellAbove: number;
  /** 停損 %（正數，例 8 = 跌破進場價 8% 出場）；0 = 停用 */
  stopLossPct: number;
  /** 停利 %（正數，例 20 = 漲過進場價 20% 出場）；0 = 停用 */
  takeProfitPct: number;
  /** 初始本金（NT$） */
  initialCapital: number;
  /** 單邊手續費率（預設 0.001425） */
  feeRate: number;
  /** 證交稅率（賣出收，預設 0.003） */
  taxRate: number;
}

/** 回測參數預設值（台股經典 9 日 KD + 與 K 線圖箭頭一致的 40/60 門檻 + 標準費率）。 */
export const DEFAULT_BACKTEST_PARAMS: BacktestParams = {
  kdPeriod: 9,
  kdSignal: 3,
  buyBelow: 40,
  sellAbove: 60,
  stopLossPct: 0,
  takeProfitPct: 0,
  initialCapital: 1_000_000,
  feeRate: 0.001425,
  taxRate: 0.003,
};

/**
 * 共用回測參數（與策略無關，所有策略共用）。
 * 策略專屬參數（kdPeriod、fastPeriod…）由各策略自行定義，與此分離。
 */
export interface CommonBacktestParams {
  /** 初始本金（NT$） */
  initialCapital: number;
  /** 單邊手續費率（預設 0.001425） */
  feeRate: number;
  /** 證交稅率（賣出收，預設 0.003） */
  taxRate: number;
  /** 停損 %（正數；0 = 停用） */
  stopLossPct: number;
  /** 停利 %（正數；0 = 停用） */
  takeProfitPct: number;
}

/** 共用回測參數預設值。 */
export const DEFAULT_COMMON_PARAMS: CommonBacktestParams = {
  initialCapital: 1_000_000,
  feeRate: 0.001425,
  taxRate: 0.003,
  stopLossPct: 0,
  takeProfitPct: 0,
};

/** 單日交易訊號（於該日「收盤」確認，引擎於隔一交易日「開盤」成交）。 */
export type DaySignal = 'buy' | 'sell';

/** 出場原因。 */
export type BacktestExitReason = 'signal' | 'stop_loss' | 'take_profit' | 'end';

/** 單筆已平倉交易明細。 */
export interface BacktestTrade {
  /** 進場日 YYYY-MM-DD（訊號日的隔一交易日，以開盤價成交） */
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  /** 股數（台股一張 = 1000 股） */
  shares: number;
  /** 毛損益（不含費用） */
  grossPnl: number;
  /** 買 + 賣手續費合計 */
  fee: number;
  /** 證交稅 */
  tax: number;
  /** 淨損益（已扣費用與稅） */
  netPnl: number;
  /** 相對進場成本（含買費）的報酬% */
  netPnlPct: number;
  /** 持有日曆天數 */
  holdingDays: number;
  exitReason: BacktestExitReason;
}

/** 權益曲線單點。 */
export interface BacktestEquityPoint {
  date: string;
  equity: number;
}

/** 回測統計摘要。 */
export interface BacktestStats {
  // 交易勝率
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  /** 勝率 %（無交易時為 0） */
  winRate: number;
  /** 平均獲利金額（勝的交易） */
  avgWin: number;
  /** 平均虧損金額（負值） */
  avgLoss: number;
  /** 獲利因子 = Σ獲利 / Σ虧損；無虧損交易時為 null（視為無限大） */
  profitFactor: number | null;
  /** 單筆最大獲利 */
  maxWin: number;
  /** 單筆最大虧損（負值） */
  maxLoss: number;
  /** 平均持有天數 */
  avgHoldingDays: number;
  // 報酬
  initialCapital: number;
  finalCapital: number;
  /** 總報酬 %（含未實現？否，期末已平倉，等同實現） */
  totalReturnPct: number;
  /** 年化報酬 CAGR % */
  annualizedPct: number;
  // 風險
  /** 最大回撤 %（權益曲線峰谷最大跌幅） */
  maxDrawdownPct: number;
  /** 年化波動度 %（每日權益報酬標準差 × √252） */
  volatilityPct: number;
  /** 類夏普值 = 年化報酬 / 年化波動（無風險利率視為 0）；波動為 0 時 null */
  sharpe: number | null;
  // benchmark
  /** 同期「買進持有」報酬 %（同初始本金，含一次買賣費用） */
  buyHoldPct: number;
  // meta
  startDate: string;
  endDate: string;
  /** 涵蓋的交易日數 */
  tradingDays: number;
  /** 涵蓋年數（日曆） */
  years: number;
}

/** 回測完整結果。 */
export interface BacktestResult {
  stats: BacktestStats;
  trades: BacktestTrade[];
  /** 策略每日權益曲線（mark-to-market） */
  equityCurve: BacktestEquityPoint[];
  /** 買進持有每日權益曲線（同初始本金，benchmark） */
  buyHoldCurve: BacktestEquityPoint[];
}

/** 比較頁單列（一個 entry 的回測摘要；前端輪詢增量填入）。 */
export interface ComparisonRow {
  /** 對應的 BacktestRun id */
  runId: string;
  strategyId: string;
  /** 顯示標籤（同策略不同參數時自動去重後綴） */
  label: string;
  params: Record<string, number>;
  /** pending | running | done | failed */
  status: string;
  error: string | null;
  /** done 才有；done 但 totalTrades=0 仍視為完成 */
  stats: BacktestStats | null;
  /** 已對齊 globalStart 的策略權益曲線 */
  equityCurve: BacktestEquityPoint[] | null;
}

/** 策略比較完整結果（單一共用買進持有 + 各策略列）。 */
export interface ComparisonResult {
  batchId: string;
  symbol: string;
  name: string | null;
  /** pending | running | done | partial | failed */
  status: string;
  startDate: string;
  endDate: string;
  /** 對齊後實際起算日（最長暖身對齊，台北時區字串） */
  globalStartDate: string | null;
  /** 單一共用買進持有報酬 % */
  buyHoldPct: number | null;
  /** 單一共用買進持有權益曲線 */
  buyHoldCurve: BacktestEquityPoint[] | null;
  /** 綜合冠軍子回測 id（須勝過買進持有才有值） */
  championRunId: string | null;
  common: CommonBacktestParams;
  rows: ComparisonRow[];
}
