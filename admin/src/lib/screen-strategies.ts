/**
 * 選股策略 registry（宣告式）。
 *
 * 每個策略＝一組 predicate（過濾）+ extra columns（額外欄位渲染）。
 * service 層用 predicate 過濾排序；選股頁用 columns 動態渲染表頭與紅綠燈。
 * 既有 all/momentum/value/chips 與新策略並存，新增策略只要往 SCREEN_STRATEGIES 加一筆。
 */
import type { GlossaryKey } from '@/config/financial-glossary';
import {
  type Verdict,
  perVerdict,
  yieldVerdict,
  revenueYoyVerdict,
  institutionalStreakVerdict,
} from '@/lib/beginner-verdict';

/** 選股器單列（service 建出，含所有策略可能用到的欄位）。 */
export interface ScreenRow {
  symbol: string;
  name: string | null;
  score: number;
  action: string;
  per: number | null;
  pbr: number | null;
  revenueYoy: number | null;
  revenueMom: number | null;
  dividendYield: number | null;
  eps: number | null;
  chipScore: number | null;
  rationale: string | null;
  institutionalStreak: number | null;
  valuationZone: string | null;
  ma120: number | null;
  ma240: number | null;
  close: number | null;
  volumeRatio: number | null;
  maBullish: boolean | null;
  /** 本益成長比 = 本益比 ÷ 營收年增率 */
  peg: number | null;
}

/** 策略額外欄位（基礎欄位之外，依策略動態顯示）。 */
export interface ScreenColumn {
  header: string;
  termKey?: GlossaryKey;
  render: (r: ScreenRow) => { text: string; verdict?: Verdict };
}

export interface ScreenStrategy {
  key: string;
  label: string;
  description: string;
  predicate: (r: ScreenRow) => boolean;
  /** 預設依評分降冪；提供時覆寫排序 */
  sort?: (a: ScreenRow, b: ScreenRow) => number;
  columns: ScreenColumn[];
}

const fmtNum = (v: number | null, suffix = ''): string => (v != null ? `${v}${suffix}` : '—');

/** 突破年線判定（無年線資料退半年線）。 */
function breaksLongMa(r: ScreenRow): boolean {
  if (r.close == null) {
    return false;
  }
  if (r.ma240 != null) {
    return r.close > r.ma240;
  }
  return r.ma120 != null && r.close > r.ma120;
}

export const SCREEN_STRATEGIES: ScreenStrategy[] = [
  {
    key: 'all',
    label: '評分排行',
    description: '依綜合健診評分由高到低排行。',
    predicate: () => true,
    columns: [],
  },
  {
    key: 'momentum',
    label: '飆股雷達（強勢）',
    description: '非賣出訊號且評分 ≥ 50 的強勢股。',
    predicate: (r) => r.action !== 'SELL' && r.score >= 50,
    columns: [],
  },
  {
    key: 'value',
    label: '低估值（本益比<20 + 營收成長）',
    description: '本益比 < 20 且營收年增為正。',
    predicate: (r) => r.per != null && r.per > 0 && r.per < 20 && (r.revenueYoy ?? -999) > 0,
    columns: [
      {
        header: 'PBR',
        termKey: 'PBR_RIVER',
        render: (r) => ({ text: fmtNum(r.pbr) }),
      },
    ],
  },
  {
    key: 'chips',
    label: '籌碼強（融資減/外資增）',
    description: '籌碼面分數 > 50。',
    predicate: (r) => (r.chipScore ?? 0) > 50,
    columns: [],
  },
  {
    key: 'inst-streak',
    label: '法人連買（≥3 日）',
    description: '三大法人連續買超 3 日以上。',
    predicate: (r) => (r.institutionalStreak ?? 0) >= 3,
    sort: (a, b) => (b.institutionalStreak ?? 0) - (a.institutionalStreak ?? 0),
    columns: [
      {
        header: '法人連買',
        termKey: 'INST_STREAK',
        render: (r) => ({
          text:
            r.institutionalStreak != null && r.institutionalStreak !== 0
              ? r.institutionalStreak > 0
                ? `連買 ${r.institutionalStreak} 日`
                : `連賣 ${-r.institutionalStreak} 日`
              : '—',
          verdict: institutionalStreakVerdict(r.institutionalStreak),
        }),
      },
    ],
  },
  {
    key: 'revenue-growth',
    label: '月營收高成長',
    description: '營收年增 ≥ 20%，或年增為正且月增 > 5%。',
    predicate: (r) =>
      (r.revenueYoy ?? -999) >= 20 || ((r.revenueYoy ?? -999) > 0 && (r.revenueMom ?? -999) > 5),
    sort: (a, b) => (b.revenueYoy ?? -999) - (a.revenueYoy ?? -999),
    columns: [
      {
        header: '營收MoM',
        termKey: 'REVENUE_MOM',
        render: (r) => ({ text: fmtNum(r.revenueMom, '%') }),
      },
    ],
  },
  {
    key: 'ma240-break',
    label: '突破年線',
    description: '股價站上年線（MA240，無則退半年線 MA120）。',
    predicate: breaksLongMa,
    columns: [
      {
        header: '年線',
        termKey: 'MA240',
        render: (r) => ({ text: fmtNum(r.ma240 ?? r.ma120) }),
      },
      {
        header: '收盤',
        render: (r) => ({ text: fmtNum(r.close) }),
      },
    ],
  },
  {
    key: 'dividend',
    label: '高殖利率存股',
    description: '殖利率 ≥ 4% 且 EPS 為正。',
    predicate: (r) => (r.dividendYield ?? 0) >= 4 && (r.eps ?? -999) > 0,
    sort: (a, b) => (b.dividendYield ?? 0) - (a.dividendYield ?? 0),
    columns: [
      {
        header: 'EPS',
        termKey: 'EPS',
        render: (r) => ({ text: fmtNum(r.eps) }),
      },
    ],
  },
  {
    key: 'ma-bull-volume',
    label: '均線多頭 + 量增',
    description: '均線多頭排列且量能比 ≥ 1.5。',
    predicate: (r) => r.maBullish === true && (r.volumeRatio ?? 0) >= 1.5,
    columns: [
      {
        header: '量能比',
        termKey: 'VOLUME',
        render: (r) => ({ text: fmtNum(r.volumeRatio, 'x') }),
      },
      {
        header: '多頭排列',
        termKey: 'MA_BULLISH',
        render: (r) => ({ text: r.maBullish ? '是' : '否' }),
      },
    ],
  },
  {
    key: 'garp',
    label: 'GARP 成長價值',
    description: '本益成長比 PEG < 1 且營收年增為正（成長又不貴）。',
    predicate: (r) => r.peg != null && r.peg > 0 && r.peg < 1 && (r.revenueYoy ?? -999) > 0,
    sort: (a, b) => (a.peg ?? 999) - (b.peg ?? 999),
    columns: [
      {
        header: 'PEG',
        termKey: 'PEG',
        render: (r) => ({ text: r.peg != null ? r.peg.toFixed(2) : '—' }),
      },
    ],
  },
];

export function getStrategy(key: string): ScreenStrategy {
  return SCREEN_STRATEGIES.find((s) => s.key === key) ?? SCREEN_STRATEGIES[0];
}

/** 基礎欄位的紅綠燈（service 不需要，供頁面共用）。 */
export const baseColumnVerdicts = { perVerdict, yieldVerdict, revenueYoyVerdict };
