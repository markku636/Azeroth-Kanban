/**
 * 多策略可調權重評分。
 *
 * Worker 只算並落庫「每因子原始 0~100 子分數」(ScoreDetail)；total 與排序在 read-time
 * 依所選策略 preset（或自訂權重）套權重即時算出。同一份 ScoreDetail 可被任意策略重新加權與
 * 重排，無需重跑 worker。
 */
import type {
  ScoreFactorKey,
  ScoringStrategyId,
  StrategyWeights,
  ScoreFactor,
  WeightedScoreFactor,
  StockScore,
} from './stock-types';

/** 五因子順序（顯示 / 補零用） */
export const FACTOR_KEYS: ScoreFactorKey[] = ['chips', 'tech', 'fund', 'momentum', 'valuation'];

/** 因子顯示名稱 */
export const FACTOR_NAMES: Record<ScoreFactorKey, string> = {
  chips: '籌碼面',
  tech: '技術面',
  fund: '基本面',
  momentum: '趨勢動能',
  valuation: '估值',
};

/** 舊版（v1）因子名稱 → key 的相容對照（舊 scoreDetail 無 key 時 fallback） */
const NAME_TO_KEY: Record<string, ScoreFactorKey> = {
  籌碼面: 'chips',
  技術面: 'tech',
  基本面: 'fund',
  趨勢動能: 'momentum',
  估值: 'valuation',
};

export interface ScoringStrategy {
  id: ScoringStrategyId;
  name: string;
  description: string;
  weights: StrategyWeights;
}

export const SCORING_STRATEGIES: Record<ScoringStrategyId, ScoringStrategy> = {
  balanced: {
    id: 'balanced',
    name: '綜合',
    description: '五因子均衡配重，適合不確定風格的全面評估。',
    weights: { chips: 0.3, tech: 0.25, fund: 0.2, momentum: 0.15, valuation: 0.1 },
  },
  value: {
    id: 'value',
    name: '價值',
    description: '重估值與基本面，找便宜又有獲利的標的。',
    weights: { chips: 0.1, tech: 0.1, fund: 0.3, momentum: 0.05, valuation: 0.45 },
  },
  momentum: {
    id: 'momentum',
    name: '動能',
    description: '重技術與趨勢動能，抓強勢上漲股。',
    weights: { chips: 0.2, tech: 0.35, fund: 0.05, momentum: 0.35, valuation: 0.05 },
  },
  chips: {
    id: 'chips',
    name: '籌碼',
    description: '重三大法人與籌碼，跟著主力買賣方向。',
    weights: { chips: 0.5, tech: 0.2, fund: 0.1, momentum: 0.15, valuation: 0.05 },
  },
  dividend: {
    id: 'dividend',
    name: '存股',
    description: '重殖利率與穩定基本面，適合長期存股。',
    weights: { chips: 0.1, tech: 0.05, fund: 0.25, momentum: 0.05, valuation: 0.55 },
  },
};

export const DEFAULT_STRATEGY: ScoringStrategyId = 'balanced';

/** 寬鬆的 scoreDetail 輸入（同時相容 v1 無 key、v2 有 key） */
interface ScoreDetailLike {
  factors?: Array<{
    key?: ScoreFactorKey;
    name?: string;
    score?: number;
    reason?: string;
  }>;
}

function resolveKey(f: { key?: ScoreFactorKey; name?: string }): ScoreFactorKey | null {
  if (f.key && FACTOR_KEYS.includes(f.key)) {
    return f.key;
  }
  if (f.name && NAME_TO_KEY[f.name]) {
    return NAME_TO_KEY[f.name];
  }
  return null;
}

/**
 * 只對「現存因子」重新分配權重並歸一化到和為 1。
 * 舊 row 缺 momentum/valuation 時，總分不致因缺因子而偏低或為 0。
 */
export function normalizeWeights(
  weights: StrategyWeights,
  presentKeys: ScoreFactorKey[],
): Record<ScoreFactorKey, number> {
  const out = {} as Record<ScoreFactorKey, number>;
  const sum = presentKeys.reduce((s, k) => s + (weights[k] ?? 0), 0);
  if (sum <= 0) {
    // 全缺權重時退回等權
    const even = presentKeys.length ? 1 / presentKeys.length : 0;
    for (const k of presentKeys) {
      out[k] = even;
    }
    return out;
  }
  for (const k of presentKeys) {
    out[k] = (weights[k] ?? 0) / sum;
  }
  return out;
}

/**
 * read-time 套策略加權，回傳含 total 的 StockScore。
 * @param detail worker 落庫的 ScoreDetail（相容 v1 舊結構 / Prisma JsonValue，型別寬鬆）
 * @param strategy 策略 id 或自訂權重組（未知 id 自動退回預設策略）
 */
export function applyStrategy(
  detail: unknown,
  strategy: ScoringStrategyId | StrategyWeights = DEFAULT_STRATEGY,
): StockScore {
  const isPreset = typeof strategy === 'string';
  const preset = isPreset ? SCORING_STRATEGIES[strategy] : undefined;
  const strategyId: ScoringStrategyId | 'custom' = isPreset
    ? preset
      ? strategy
      : DEFAULT_STRATEGY
    : 'custom';
  const weights: StrategyWeights = isPreset
    ? (preset ?? SCORING_STRATEGIES[DEFAULT_STRATEGY]).weights
    : strategy;

  const like = (detail ?? null) as ScoreDetailLike | null;
  const rawFactors = like?.factors ?? [];
  // 正規化：補 key、過濾無法辨識的因子
  const normalized: ScoreFactor[] = [];
  for (const f of rawFactors) {
    const key = resolveKey(f);
    if (!key) {
      continue;
    }
    normalized.push({
      key,
      name: f.name ?? FACTOR_NAMES[key],
      score: typeof f.score === 'number' ? f.score : 0,
      reason: f.reason ?? '',
    });
  }

  if (!normalized.length) {
    return { total: 0, strategyId, factors: [] };
  }

  const presentKeys = normalized.map((f) => f.key);
  const norm = normalizeWeights(weights, presentKeys);

  const factors: WeightedScoreFactor[] = normalized.map((f) => {
    const weight = norm[f.key] ?? 0;
    return { ...f, weight, weighted: f.score * weight };
  });
  const total = Math.round(factors.reduce((s, f) => s + f.weighted, 0));
  return { total, strategyId, factors };
}

/** 解析 query string 形式的自訂權重 "chips:0.3,tech:0.25,..."；無效回 null。 */
export function parseWeights(raw: string | null | undefined): StrategyWeights | null {
  if (!raw) {
    return null;
  }
  const out = {} as Record<ScoreFactorKey, number>;
  let any = false;
  for (const part of raw.split(',')) {
    const [k, v] = part.split(':');
    const key = (k ?? '').trim() as ScoreFactorKey;
    const num = Number(v);
    if (FACTOR_KEYS.includes(key) && Number.isFinite(num) && num >= 0) {
      out[key] = num;
      any = true;
    }
  }
  if (!any) {
    return null;
  }
  // 補滿缺漏因子為 0
  for (const k of FACTOR_KEYS) {
    if (out[k] == null) {
      out[k] = 0;
    }
  }
  return out;
}

/** 取得內建策略清單（給前端下拉）。 */
export function listStrategies(): ScoringStrategy[] {
  return Object.values(SCORING_STRATEGIES);
}
