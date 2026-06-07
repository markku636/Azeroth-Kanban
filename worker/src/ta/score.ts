/**
 * 多因子健診評分（可解釋，純函式）。
 *
 * 此模組只計算「每因子原始 0~100 子分數」(ScoreDetail)，不含 total / 不含權重；
 * total 與排序由 read-time 的 applyStrategy（@azeroth/common）依所選策略套權重算出。
 * 因子：籌碼 / 技術 / 基本面 / 趨勢動能 / 估值。
 */
import type { TradeSignal, StockFundamentalDto, ScoreDetail, StockScore } from '@azeroth/common';
import { FACTOR_NAMES, applyStrategy, DEFAULT_STRATEGY } from '@azeroth/common';
import { scoreChips } from './scorers/chips.js';
import { scoreTech } from './scorers/tech.js';
import { scoreFund } from './scorers/fund.js';
import { scoreMomentum } from './scorers/momentum.js';
import { scoreValuation, type ValuationZoneLevel } from './scorers/valuation.js';

export interface ScoreInput {
  /** 融資券/外資籌碼 bias（-2~2，來自 computeChipSummary） */
  chipBias: number;
  /** 三大法人連買賣 bias（-2~2，來自 computeInstitutionalSummary；WP-B 提供） */
  instBias?: number;
  signal: Pick<TradeSignal, 'action' | 'confidence' | 'indicators'>;
  fundamental: StockFundamentalDto;
  /** 估值河流位階（WP-C 提供） */
  valuationZone?: ValuationZoneLevel;
}

/** 計算未加權的五因子明細（落庫 AnalysisSignal.scoreDetail）。 */
export function computeScoreDetail(input: ScoreInput): ScoreDetail {
  const chips = scoreChips(input.chipBias, input.instBias ?? 0);
  const tech = scoreTech(input.signal);
  const fund = scoreFund(input.fundamental);
  const momentum = scoreMomentum(input.signal.indicators);
  const valuation = scoreValuation(input.fundamental, input.valuationZone);
  return {
    version: 2,
    factors: [
      { key: 'chips', name: FACTOR_NAMES.chips, score: Math.round(chips.score), reason: chips.reason },
      { key: 'tech', name: FACTOR_NAMES.tech, score: Math.round(tech.score), reason: tech.reason },
      { key: 'fund', name: FACTOR_NAMES.fund, score: Math.round(fund.score), reason: fund.reason },
      {
        key: 'momentum',
        name: FACTOR_NAMES.momentum,
        score: Math.round(momentum.score),
        reason: momentum.reason,
      },
      {
        key: 'valuation',
        name: FACTOR_NAMES.valuation,
        score: Math.round(valuation.score),
        reason: valuation.reason,
      },
    ],
  };
}

/**
 * 相容包裝：以預設策略（綜合）回傳含 total 的 StockScore。
 * 供仍需要單一總分的呼叫端（研究報告、舊測試）使用。
 */
export function computeStockScore(input: ScoreInput): StockScore {
  return applyStrategy(computeScoreDetail(input), DEFAULT_STRATEGY);
}
