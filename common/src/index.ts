export { ApiReturnCode, ApiResponse } from './api-response';
export type { ApiResult } from './api-response';
export { ApiErrorCode } from './api-error-code';
export type { ApiErrorCodeValue } from './api-error-code';
export { StockJobType, STOCK_DISCLAIMER } from './stock-types';
export type {
  StockOhlcv,
  StockIndicators,
  CandlePattern,
  SignalAction,
  TradeSignal,
  ReportSource,
  ResearchReportDto,
  MarketReportDto,
  TopGainer,
  InstitutionalTrade,
  ChipDaily,
  StockFundamentalDto,
  ScoreFactor,
  ScoreFactorKey,
  ScoringStrategyId,
  StrategyWeights,
  ScoreDetail,
  WeightedScoreFactor,
  StockScore,
  StockJobTypeValue,
  KdLightColor,
  KdDirectionLight,
  KdEntryLight,
  KdVerdict,
  UsIndexQuote,
  FuturesInstitutionOi,
  FuturesChip,
  GlobalMarketData,
} from './stock-types';
export {
  FACTOR_KEYS,
  FACTOR_NAMES,
  SCORING_STRATEGIES,
  DEFAULT_STRATEGY,
  applyStrategy,
  normalizeWeights,
  parseWeights,
  listStrategies,
} from './scoring-strategy';
export type { ScoringStrategy } from './scoring-strategy';
export { computeRiverBands, valuationZone } from './valuation-bands';
export type {
  ValuationMetric,
  ValuationZoneLevel,
  ValuationPoint,
  BandLevel,
  RiverBands,
  ValuationZone,
} from './valuation-bands';
export { runKdBacktest, stochasticSeries, computeStats } from './backtest/kd-strategy';
export { DEFAULT_BACKTEST_PARAMS, DEFAULT_COMMON_PARAMS } from './backtest/types';
export type {
  BacktestParams,
  CommonBacktestParams,
  DaySignal,
  BacktestExitReason,
  BacktestTrade,
  BacktestEquityPoint,
  BacktestStats,
  BacktestResult,
  ComparisonRow,
  ComparisonResult,
} from './backtest/types';
// 多策略回測：引擎 / 註冊表 / 中繼資料 / 指標 / 參數
export { runBacktest, buildBuyHoldCurve } from './backtest/engine';
export {
  STRATEGY_REGISTRY,
  getStrategy,
  listStrategyIds,
  runStrategyBacktest,
} from './backtest/registry';
export type { StrategyDef } from './backtest/registry';
export {
  STRATEGY_META,
  listStrategyMeta,
  getStrategyMeta,
  clampParams,
} from './backtest/strategy-meta';
export type { ParamField, StrategyMeta } from './backtest/strategy-meta';
export { parseCommonParams, normalizeStoredParams } from './backtest/params';
export {
  smaSeries,
  emaSeries,
  rsiSeries,
  macdSeries,
  bollingerSeries,
} from './backtest/indicators';
export type { KdPoint, MacdPoint, BollingerPoint } from './backtest/indicators';
