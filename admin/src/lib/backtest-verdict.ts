/**
 * 把回測數字翻成「紅綠燈白話結論」（仿 console 的 kd-verdict / StockVerdictCard 慣例）。
 *
 * 純函式、無副作用；對 null / undefined 一律回中性，不讓空值無聲傳遞（coding-standards §四）。
 *
 * ⚠️ 顏色慣例：本檔燈號採「號誌語意」— good＝綠（好）、neutral＝黃（普通）、bad＝紅（要注意），
 * 與 `StockVerdictCard` 一致。這與金額用的「台股慣例（紅＝賺）」是兩套並存，互不衝突。
 */

export type BacktestTone = 'good' | 'neutral' | 'bad';

/** 結論卡整體等級：good＝綠 / mixed＝黃 / bad＝紅 / none＝不渲染（無交易）。 */
export type BacktestVerdictLevel = 'good' | 'mixed' | 'bad' | 'none';

export interface BacktestLight {
  icon: string;
  title: string;
  tone: BacktestTone;
  label: string;
}

export interface BacktestVerdict {
  level: BacktestVerdictLevel;
  headline: string;
  lights: BacktestLight[];
  action: string;
}

/** 判讀所需的回測摘要數字（皆可為 null）。 */
export interface BacktestVerdictInput {
  /** 策略總報酬 %（例 12.2） */
  totalReturnPct: number | null;
  /** 買進持有對照報酬 % */
  buyHoldPct: number | null;
  /** 勝率 %（0–100） */
  winRate: number | null;
  /** 最大回撤 %（正數，例 9.3 代表最慘 -9.3%） */
  maxDrawdownPct: number | null;
  /** 總交易筆數 */
  totalTrades: number | null;
}

const WIN_RATE_HIGH = 60;
const WIN_RATE_LOW = 40;
const DRAWDOWN_SHALLOW = 10;
const DRAWDOWN_DEEP = 20;

/** 帶正負號的百分比文字。 */
function signedPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

/** ① 賺賠燈：賺＝綠、賠＝紅。 */
function profitLight(ret: number | null): BacktestLight {
  const base = { icon: '💰', title: '賺賠' };
  if (ret == null) {
    return { ...base, tone: 'neutral', label: '資料不足' };
  }
  if (ret >= 0) {
    return { ...base, tone: 'good', label: `賺錢（${signedPct(ret)}）` };
  }
  return { ...base, tone: 'bad', label: `賠錢（${signedPct(ret)}）` };
}

/** ② 是否贏過大盤（買進持有）燈。 */
function beatLight(ret: number | null, buyHold: number | null): BacktestLight {
  const base = { icon: '🆚', title: '比大盤' };
  if (ret == null || buyHold == null) {
    return { ...base, tone: 'neutral', label: '無大盤對照' };
  }
  const diff = ret - buyHold;
  if (diff >= 0) {
    return { ...base, tone: 'good', label: `贏過一路抱著（多 ${diff.toFixed(1)} 個百分點）` };
  }
  return {
    ...base,
    tone: 'bad',
    label: `輸給一路抱著（少 ${Math.abs(diff).toFixed(1)} 個百分點）`,
  };
}

/** ③ 勝率高低燈。 */
function winRateLight(winRate: number | null): BacktestLight {
  const base = { icon: '🎯', title: '勝率' };
  if (winRate == null) {
    return { ...base, tone: 'neutral', label: '資料不足' };
  }
  if (winRate >= WIN_RATE_HIGH) {
    return { ...base, tone: 'good', label: `偏高（${winRate.toFixed(0)}%）` };
  }
  if (winRate >= WIN_RATE_LOW) {
    return { ...base, tone: 'neutral', label: `中等（${winRate.toFixed(0)}%）` };
  }
  return { ...base, tone: 'bad', label: `偏低（${winRate.toFixed(0)}%）` };
}

/** ④ 風險（最大回撤）深淺燈：越淺越好。 */
function drawdownLight(maxDrawdownPct: number | null): BacktestLight {
  const base = { icon: '🛟', title: '風險' };
  if (maxDrawdownPct == null) {
    return { ...base, tone: 'neutral', label: '資料不足' };
  }
  if (maxDrawdownPct <= DRAWDOWN_SHALLOW) {
    return { ...base, tone: 'good', label: `回撤淺（最慘 -${maxDrawdownPct.toFixed(1)}%）` };
  }
  if (maxDrawdownPct <= DRAWDOWN_DEEP) {
    return { ...base, tone: 'neutral', label: `回撤中等（最慘 -${maxDrawdownPct.toFixed(1)}%）` };
  }
  return {
    ...base,
    tone: 'bad',
    label: `回撤偏深（最慘 -${maxDrawdownPct.toFixed(1)}%，要扛得住）`,
  };
}

/** 依「賺賠 × 是否贏大盤」決定整體標題、等級與一句話建議。 */
function summarize(
  ret: number | null,
  buyHold: number | null,
): Pick<BacktestVerdict, 'level' | 'headline' | 'action'> {
  if (ret == null) {
    return {
      level: 'mixed',
      headline: '回測完成，請參考下方數字',
      action: '可搭配「資料來源與計算方式」一起看，了解這次模擬的假設。',
    };
  }
  if (ret < 0) {
    return {
      level: 'bad',
      headline: '這檔／這組參數不適合這個策略（賠錢）',
      action: '先別用這組參數下實單；可換一檔股票、調整 KD 買賣門檻，或加上停損後再回測比較。',
    };
  }
  // 以下為「有賺錢」
  if (buyHold == null) {
    return {
      level: 'good',
      headline: '這段期間有賺錢 👍',
      action: '過去績效不代表未來，實單仍要設好停損、分批進出。',
    };
  }
  if (ret >= buyHold) {
    return {
      level: 'good',
      headline: '賺錢，而且贏過大盤 👍',
      action: '這檔在此區間適合波段操作；但過去績效不代表未來，實單仍要設好停損。',
    };
  }
  return {
    level: 'mixed',
    headline: '有賺，但跑輸大盤（KD 常常太早下車）',
    action:
      'KD 勝率不錯卻容易賣在半山腰，遇到大多頭會輸給「一路抱著」。可放寬賣出門檻、拉長持有，或對長線強勢股直接買進持有。',
  };
}

/**
 * 由回測摘要數字產生紅綠燈白話結論。
 * 無交易（totalTrades 為 0 或 null）回 `level: 'none'`，呼叫端不渲染卡片。
 */
export function buildBacktestVerdict(input: BacktestVerdictInput): BacktestVerdict {
  if (!input.totalTrades) {
    return {
      level: 'none',
      headline: '這段期間沒有出手',
      action: '可放寬買賣門檻或拉長回測期間再試一次。',
      lights: [],
    };
  }

  const lights: BacktestLight[] = [
    profitLight(input.totalReturnPct),
    beatLight(input.totalReturnPct, input.buyHoldPct),
    winRateLight(input.winRate),
    drawdownLight(input.maxDrawdownPct),
  ];

  return { ...summarize(input.totalReturnPct, input.buyHoldPct), lights };
}
