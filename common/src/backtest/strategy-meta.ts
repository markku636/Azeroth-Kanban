/**
 * 策略「中繼資料」（純資料，零函式參考，不 import engine / indicators）。
 *
 * 設計目的：前端表單只需 import 此檔即可動態渲染策略選單與參數欄位，
 * 不會把回測引擎/指標邏輯灌進 client bundle。各策略的 warmup / validate / generateSignals
 * 在 strategies/*.ts，由 registry 組合。
 */

/** 動態表單欄位描述。 */
export interface ParamField {
  /** 參數鍵（同時是 BacktestRun.params 內的鍵） */
  key: string;
  /** 中文標籤 */
  label: string;
  min: number;
  max: number;
  /** 步進；< 1 時不取整（如 stdDev 0.1） */
  step?: number;
  /** true → 收進「進階設定」 */
  advanced?: boolean;
  /** 對應名詞字典 key（admin TermLabel 浮窗用） */
  glossaryKey?: string;
}

/** 策略中繼資料。 */
export interface StrategyMeta {
  id: string;
  /** 中文名稱（下拉選單用） */
  label: string;
  /** 白話一句話說明 */
  description: string;
  /** 相關名詞 key（新手導覽用） */
  glossaryKeys: string[];
  paramFields: ParamField[];
  defaultParams: Record<string, number>;
}

/** 五策略中繼資料（KD + 均線 / MACD / RSI / 布林）。 */
export const STRATEGY_META: StrategyMeta[] = [
  {
    id: 'kd',
    label: 'KD 黃金交叉',
    description: 'KD 低檔黃金交叉買進、高檔死亡交叉賣出（與 K 線圖箭頭一致）。',
    glossaryKeys: ['KD', 'KD_CROSS'],
    paramFields: [
      { key: 'kdPeriod', label: 'KD 週期', min: 2, max: 60, glossaryKey: 'KD' },
      { key: 'buyBelow', label: '買進門檻（K<此值黃金交叉）', min: 1, max: 99 },
      { key: 'sellAbove', label: '賣出門檻（K>此值死亡交叉）', min: 1, max: 99 },
      { key: 'kdSignal', label: 'KD 信號（D 線平滑）', min: 1, max: 20, advanced: true },
    ],
    defaultParams: { kdPeriod: 9, kdSignal: 3, buyBelow: 40, sellAbove: 60 },
  },
  {
    id: 'ma',
    label: '均線交叉 MA',
    description: '短均線向上穿越長均線買進、向下跌破賣出（最經典的趨勢策略）。',
    glossaryKeys: ['MA', 'MA_PERIOD'],
    paramFields: [
      { key: 'fastPeriod', label: '快線週期', min: 2, max: 120, glossaryKey: 'MA_PERIOD' },
      { key: 'slowPeriod', label: '慢線週期', min: 3, max: 240, glossaryKey: 'MA_PERIOD' },
    ],
    defaultParams: { fastPeriod: 5, slowPeriod: 20 },
  },
  {
    id: 'macd',
    label: 'MACD 金叉/死叉',
    description: 'MACD 柱狀體由負翻正（金叉）買進、由正翻負（死叉）賣出。',
    glossaryKeys: ['MACD', 'MACD_FAST_PERIOD', 'MACD_SLOW_PERIOD', 'MACD_SIGNAL_PERIOD'],
    paramFields: [
      { key: 'fast', label: '快線週期', min: 2, max: 60, glossaryKey: 'MACD_FAST_PERIOD' },
      { key: 'slow', label: '慢線週期', min: 3, max: 120, glossaryKey: 'MACD_SLOW_PERIOD' },
      {
        key: 'signal',
        label: '訊號線週期',
        min: 1,
        max: 40,
        advanced: true,
        glossaryKey: 'MACD_SIGNAL_PERIOD',
      },
    ],
    defaultParams: { fast: 12, slow: 26, signal: 9 },
  },
  {
    id: 'rsi',
    label: 'RSI 超賣/超買',
    description: 'RSI 跌破超賣門檻買進、突破超買門檻賣出（逆勢/區間操作）。',
    glossaryKeys: ['RSI', 'RSI_PERIOD', 'RSI_OVERSOLD', 'RSI_OVERBOUGHT'],
    paramFields: [
      { key: 'period', label: 'RSI 週期', min: 2, max: 60, glossaryKey: 'RSI_PERIOD' },
      { key: 'oversold', label: '超賣門檻（買進）', min: 1, max: 50, glossaryKey: 'RSI_OVERSOLD' },
      {
        key: 'overbought',
        label: '超買門檻（賣出）',
        min: 50,
        max: 99,
        glossaryKey: 'RSI_OVERBOUGHT',
      },
    ],
    defaultParams: { period: 14, oversold: 30, overbought: 70 },
  },
  {
    id: 'bollinger',
    label: '布林通道 Bollinger',
    description: '收盤突破上軌買進、跌破中軌賣出（波動率突破）。',
    glossaryKeys: ['BOLLINGER', 'BOLLINGER_PERIOD', 'BOLLINGER_STD_DEV'],
    paramFields: [
      { key: 'period', label: '布林週期', min: 2, max: 120, glossaryKey: 'BOLLINGER_PERIOD' },
      {
        key: 'stdDev',
        label: '標準差倍數',
        min: 0.5,
        max: 4,
        step: 0.1,
        glossaryKey: 'BOLLINGER_STD_DEV',
      },
    ],
    defaultParams: { period: 20, stdDev: 2 },
  },
];

/** 取所有策略中繼資料（前端表單用，回傳純資料）。 */
export function listStrategyMeta(): StrategyMeta[] {
  return STRATEGY_META;
}

/** 依 id 取單一策略中繼資料。 */
export function getStrategyMeta(id: string): StrategyMeta | undefined {
  return STRATEGY_META.find((m) => m.id === id);
}

/**
 * 依 paramFields 的 min/max/step 將原始輸入夾擠 + 取整 + 套預設，回傳乾淨的策略參數。
 * step < 1 的欄位（如 stdDev）不取整。
 */
export function clampParams(meta: StrategyMeta, raw: unknown): Record<string, number> {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const f of meta.paramFields) {
    const fallback = meta.defaultParams[f.key];
    const v = src[f.key];
    let n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    n = Math.min(Math.max(n, f.min), f.max);
    if (!f.step || f.step >= 1) {
      n = Math.round(n);
    }
    out[f.key] = n;
  }
  return out;
}
