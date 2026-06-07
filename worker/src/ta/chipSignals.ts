/** 籌碼面摘要與訊號（純函式，可測）。 */
import type { ChipDaily } from '@azeroth/common';

export interface ChipSummary {
  /** 最新融資餘額（張） */
  marginBalance: number | null;
  /** 近 5 日融資餘額變化（張，正=增） */
  marginChange5: number | null;
  /** 最新融券餘額（張） */
  shortBalance: number | null;
  /** 最新外資持股比例（%） */
  foreignRatio: number | null;
  /** 近 5 日外資持股比例變化（百分點） */
  foreignRatioChange5: number | null;
  /** 文字摘要 */
  text: string;
  /** 偏多分數貢獻（-2~+2，供多因子評分用） */
  bias: number;
}

function nthFromEnd<T>(arr: T[], n: number): T | undefined {
  return arr[arr.length - n];
}

/** 由近期籌碼算摘要。融資減 = 浮額減（偏多）；外資持股比例升 = 偏多。 */
export function computeChipSummary(chips: ChipDaily[]): ChipSummary {
  if (!chips.length) {
    return {
      marginBalance: null,
      marginChange5: null,
      shortBalance: null,
      foreignRatio: null,
      foreignRatioChange5: null,
      text: '無籌碼資料',
      bias: 0,
    };
  }
  const last = chips[chips.length - 1];
  const prev5 = nthFromEnd(chips, 6) ?? chips[0];

  const marginChange5 = last.marginBalance - prev5.marginBalance;
  const foreignRatioChange5 =
    last.foreignRatio != null && prev5.foreignRatio != null
      ? Math.round((last.foreignRatio - prev5.foreignRatio) * 100) / 100
      : null;

  let bias = 0;
  const parts: string[] = [];
  parts.push(`融資餘額 ${last.marginBalance.toLocaleString()} 張`);
  if (marginChange5 < 0) {
    bias += 1;
    parts.push(`近5日融資減 ${Math.abs(marginChange5).toLocaleString()} 張(浮額消化，偏多)`);
  } else if (marginChange5 > 0) {
    bias -= 0.5;
    parts.push(`近5日融資增 ${marginChange5.toLocaleString()} 張`);
  }
  parts.push(`融券餘額 ${last.shortBalance.toLocaleString()} 張`);
  if (last.foreignRatio != null) {
    parts.push(`外資持股 ${last.foreignRatio}%`);
    if (foreignRatioChange5 != null && foreignRatioChange5 > 0) {
      bias += 1;
      parts.push(`近5日外資持股 +${foreignRatioChange5}pp(偏多)`);
    } else if (foreignRatioChange5 != null && foreignRatioChange5 < 0) {
      bias -= 1;
      parts.push(`近5日外資持股 ${foreignRatioChange5}pp(偏空)`);
    }
  }

  return {
    marginBalance: last.marginBalance,
    marginChange5,
    shortBalance: last.shortBalance,
    foreignRatio: last.foreignRatio,
    foreignRatioChange5,
    text: parts.join('；'),
    bias: Math.max(-2, Math.min(2, bias)),
  };
}

/** 三大法人連續買賣超與集中度摘要（供 chips 因子評分與警報用）。 */
export interface InstitutionalSummary {
  /** 最新一日三大法人合計淨買賣超（股，正=買超） */
  netToday: number | null;
  /** 近 5 日合計淨買賣超（股） */
  net5: number | null;
  /** 連續買/賣超天數（正=連買、負=連賣、0=中性或反向） */
  streakDays: number;
  /** 籌碼集中度：近5日淨買超 ÷ 近5日總量（%） */
  concentration: number | null;
  /** 偏多分數貢獻 −2~+2，供多因子評分用 */
  bias: number;
  text: string;
}

/**
 * 由依日彙整的三大法人淨買賣超算 streak / 集中度 / bias。
 * @param daily 依日升冪的合計淨額序列
 * @param avgVol5 近 5 日均量（股）；缺則集中度回 null
 */
export function computeInstitutionalSummary(
  daily: { totalNet: number }[],
  avgVol5: number | null,
): InstitutionalSummary {
  if (!daily.length) {
    return {
      netToday: null,
      net5: null,
      streakDays: 0,
      concentration: null,
      bias: 0,
      text: '無法人資料',
    };
  }

  const netToday = daily[daily.length - 1].totalNet;
  const net5 = daily.slice(-5).reduce((s, d) => s + d.totalNet, 0);

  // streak：從最後一天往前，連續同號（買超/賣超）天數
  const sign = Math.sign(netToday);
  let count = 0;
  if (sign !== 0) {
    for (let i = daily.length - 1; i >= 0; i--) {
      if (daily[i].totalNet !== 0 && Math.sign(daily[i].totalNet) === sign) {
        count++;
      } else {
        break;
      }
    }
  }
  const streakDays = count * sign; // 正=連買、負=連賣

  const concentration =
    avgVol5 != null && avgVol5 > 0 ? Math.round((net5 / (avgVol5 * 5)) * 10000) / 100 : null;

  // bias：連買 ≥3 →±1、≥5 →±2；集中度同向 >20% 再 ±0.5；clamp −2~+2
  let bias = 0;
  const absStreak = Math.abs(streakDays);
  if (absStreak >= 5) {
    bias = 2 * Math.sign(streakDays);
  } else if (absStreak >= 3) {
    bias = 1 * Math.sign(streakDays);
  }
  if (concentration != null && Math.abs(concentration) > 20) {
    bias += 0.5 * Math.sign(concentration);
  }
  bias = Math.max(-2, Math.min(2, bias));

  const parts: string[] = [];
  if (streakDays > 0) {
    parts.push(`三大法人連買 ${streakDays} 日`);
  } else if (streakDays < 0) {
    parts.push(`三大法人連賣 ${-streakDays} 日`);
  } else {
    parts.push('三大法人買賣超中性');
  }
  if (concentration != null) {
    parts.push(`集中度 ${concentration}%`);
  }

  return { netToday, net5, streakDays, concentration, bias, text: parts.join('；') };
}
