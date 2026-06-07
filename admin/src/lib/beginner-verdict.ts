/**
 * 把「數值」翻成小白看得懂的「白話結論」。
 *
 * 純函式，無副作用；對 null / undefined 一律回傳中性預設（遵守 coding-standards §四，
 * 不讓空值無聲傳遞）。tone 對應顏色採台股慣例：good＝紅、bad＝綠、neutral＝灰。
 */

export type VerdictTone = 'good' | 'neutral' | 'bad';

export interface Verdict {
  /** 白話結論文字 */
  text: string;
  /** 語意傾向（決定顏色 / emoji） */
  tone: VerdictTone;
}

const UNKNOWN: Verdict = { text: '資料不足', tone: 'neutral' };

/** 本益比結論：越低越便宜（須同產業比較）。0 或負值代表 EPS 失真。 */
export function perVerdict(per: number | null | undefined): Verdict {
  if (per == null || per <= 0) {
    return { text: '無法判斷（虧損或失真）', tone: 'neutral' };
  }
  if (per < 15) {
    return { text: '偏便宜', tone: 'good' };
  }
  if (per <= 25) {
    return { text: '合理', tone: 'neutral' };
  }
  return { text: '偏貴', tone: 'bad' };
}

/** 殖利率結論：越高現金回報越多。 */
export function yieldVerdict(rate: number | null | undefined): Verdict {
  if (rate == null) {
    return UNKNOWN;
  }
  if (rate >= 5) {
    return { text: '高殖利率', tone: 'good' };
  }
  if (rate >= 2.5) {
    return { text: '殖利率中等', tone: 'neutral' };
  }
  return { text: '殖利率偏低', tone: 'neutral' };
}

/** 健診評分結論：0~100，越高體質越強。 */
export function scoreVerdict(score: number | null | undefined): Verdict {
  if (score == null) {
    return UNKNOWN;
  }
  if (score >= 70) {
    return { text: '體質偏強', tone: 'good' };
  }
  if (score <= 40) {
    return { text: '體質偏弱', tone: 'bad' };
  }
  return { text: '體質中性', tone: 'neutral' };
}

/** 營收年增率結論：正為成長、負為衰退。 */
export function revenueYoyVerdict(yoy: number | null | undefined): Verdict {
  if (yoy == null) {
    return UNKNOWN;
  }
  if (yoy >= 20) {
    return { text: '高成長', tone: 'good' };
  }
  if (yoy >= 0) {
    return { text: '成長', tone: 'good' };
  }
  return { text: '衰退', tone: 'bad' };
}

/** 趨向指標 DMI/ADX 結論：ADX>25 有趨勢，+DI/−DI 決定方向。 */
export function adxVerdict(
  adx: number | null | undefined,
  plusDi: number | null | undefined,
  minusDi: number | null | undefined,
): Verdict {
  if (adx == null) {
    return UNKNOWN;
  }
  if (adx < 20) {
    return { text: '盤整無趨勢', tone: 'neutral' };
  }
  if (adx >= 25 && plusDi != null && minusDi != null) {
    if (plusDi > minusDi) {
      return { text: '多方趨勢明確', tone: 'good' };
    }
    if (minusDi > plusDi) {
      return { text: '空方趨勢明確', tone: 'bad' };
    }
  }
  return { text: '趨勢醞釀中', tone: 'neutral' };
}

/** 威廉指標 %R 結論：−80 以下偏冷、−20 以上偏熱。 */
export function williamsVerdict(r: number | null | undefined): Verdict {
  if (r == null) {
    return UNKNOWN;
  }
  if (r < -80) {
    return { text: '偏冷（可能反彈）', tone: 'good' };
  }
  if (r > -20) {
    return { text: '偏熱（小心追高）', tone: 'bad' };
  }
  return { text: '位階中性', tone: 'neutral' };
}

/** 乖離率（20 日）結論：正乖離過大易拉回、負乖離過大易反彈。 */
export function biasVerdict(bias20: number | null | undefined): Verdict {
  if (bias20 == null) {
    return UNKNOWN;
  }
  if (bias20 > 12) {
    return { text: '正乖離過大（易拉回）', tone: 'bad' };
  }
  if (bias20 < -12) {
    return { text: '負乖離過大（易反彈）', tone: 'good' };
  }
  return { text: '乖離正常', tone: 'neutral' };
}

/** 估值位階結論：便宜（偏多/好）、昂貴（偏空/差）、合理（中性）。 */
export function valuationVerdict(zone: string | null | undefined): Verdict {
  if (zone === 'cheap') {
    return { text: '便宜（歷史低檔）', tone: 'good' };
  }
  if (zone === 'expensive') {
    return { text: '昂貴（歷史高檔）', tone: 'bad' };
  }
  if (zone === 'fair') {
    return { text: '合理', tone: 'neutral' };
  }
  return UNKNOWN;
}

/** 三大法人連續買賣超結論：正=連買（偏多）、負=連賣（偏空）。 */
export function institutionalStreakVerdict(streak: number | null | undefined): Verdict {
  if (streak == null || streak === 0) {
    return { text: '法人買賣中性', tone: 'neutral' };
  }
  if (streak >= 3) {
    return { text: `法人連買 ${streak} 日（偏多）`, tone: 'good' };
  }
  if (streak <= -3) {
    return { text: `法人連賣 ${-streak} 日（偏空）`, tone: 'bad' };
  }
  return { text: streak > 0 ? `法人連買 ${streak} 日` : `法人連賣 ${-streak} 日`, tone: 'neutral' };
}

/** 系統動作訊號結論：BUY / HOLD / SELL。 */
export function actionVerdict(action: string | null | undefined): Verdict {
  if (action === 'BUY') {
    return { text: '偏多（買進訊號）', tone: 'good' };
  }
  if (action === 'SELL') {
    return { text: '偏空（賣出訊號）', tone: 'bad' };
  }
  if (action === 'HOLD') {
    return { text: '中性（觀望）', tone: 'neutral' };
  }
  return UNKNOWN;
}
