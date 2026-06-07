/**
 * 多週期 KD 紅綠燈結論（給小白的「該不該買」白話判斷）。
 *
 * 抄三竹「月線看大方向、60 分鐘看切入點」的 KD 黃線（D 慢線）方向法：
 * - 大方向：月 KD 的 D 線方向 + 位階（月線資料不足時自動退回週 KD）。
 * - 切入點：日 KD 的 D 線方向，替代三竹的 60 分鐘線（本專案無盤中資料）。
 *
 * 全程用已聚合好的前端 Bar[] 計算，零外部依賴、不動 schema / worker / API。
 */

import {
  STOCK_DISCLAIMER,
  type KdDirectionLight,
  type KdEntryLight,
  type KdLightColor,
  type KdVerdict,
} from '@azeroth/common';
import { aggregate, type Bar } from '@/lib/kline-aggregate';

/** KD 參數：採台股經典 9 日 KD（三竹同款），月線資料較少時仍算得出方向。 */
const KD_PERIOD = 9;
const KD_SIGNAL = 3;
/** D 位階門檻（號誌語意：過熱別追 / 低檔較佳） */
const KD_HIGH_ZONE = 80;
const KD_LOW_ZONE = 20;
/** 算出「有方向」的 KD（至少 2 個 D 值）所需的最少 K 棒數 */
const MIN_BARS = KD_PERIOD + KD_SIGNAL;
/** 買賣箭頭門檻：低檔黃金交叉 K < 此值才算買、高檔死亡交叉 K > 此值才算賣（與 worker signals.ts 一致） */
const KD_GOLDEN_CROSS_MAX = 40;
const KD_DEAD_CROSS_MIN = 60;

interface KdPoint {
  k: number;
  d: number;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * 極簡 Stochastic（fast KD）：k = 原始 %K，d = k 的 signal 期 SMA，回完整序列。
 * 與 worker 用的 technicalindicators 同公式，僅內聯以避免 admin 新增依賴。
 */
function stochastic(bars: Bar[], period = KD_PERIOD, signal = KD_SIGNAL): KdPoint[] {
  if (bars.length < period) {
    return [];
  }
  const rawK: number[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (bars[j].high > hh) {
        hh = bars[j].high;
      }
      if (bars[j].low < ll) {
        ll = bars[j].low;
      }
    }
    const range = hh - ll;
    // 區間為 0（極罕見的整段平盤）→ 視為中性 50，避免除以零
    rawK.push(range > 0 ? ((bars[i].close - ll) / range) * 100 : 50);
  }
  const out: KdPoint[] = [];
  for (let i = signal - 1; i < rawK.length; i++) {
    let sum = 0;
    for (let j = i - signal + 1; j <= i; j++) {
      sum += rawK[j];
    }
    out.push({ k: rawK[i], d: sum / signal });
  }
  return out;
}

/** 黃線（D 慢線）方向：前一筆 D < 當前 D 為向上；序列不足回 null。 */
function dRising(series: KdPoint[]): boolean | null {
  if (series.length < 2) {
    return null;
  }
  return series[series.length - 1].d > series[series.length - 2].d;
}

function zoneOf(d: number): 'high' | 'low' | 'mid' {
  if (d >= KD_HIGH_ZONE) {
    return 'high';
  }
  if (d <= KD_LOW_ZONE) {
    return 'low';
  }
  return 'mid';
}

/** 大方向燈：先試月 KD，月線資料不足則退回週 KD，都不足則灰燈。 */
function buildDirectionLight(
  monthBars: Bar[],
  weekBars: Bar[],
): { light: KdDirectionLight; degraded: KdVerdict['degraded'] } {
  let basis: KdDirectionLight['basis'] = 'none';
  let series: KdPoint[] = [];
  let degraded: KdVerdict['degraded'] = 'none';

  const monthSeries = stochastic(monthBars);
  if (monthBars.length >= MIN_BARS && monthSeries.length >= 2) {
    basis = 'month';
    series = monthSeries;
  } else {
    const weekSeries = stochastic(weekBars);
    if (weekBars.length >= MIN_BARS && weekSeries.length >= 2) {
      basis = 'week';
      series = weekSeries;
      degraded = 'usedWeek';
    }
  }

  if (basis === 'none') {
    return {
      light: {
        color: 'gray',
        basis: 'none',
        dValue: null,
        dRising: null,
        zone: 'mid',
        label: '資料太少，看不出大方向',
      },
      degraded: 'insufficient',
    };
  }

  const last = series[series.length - 1];
  const rising = dRising(series);
  const zone = zoneOf(last.d);

  let color: KdLightColor = 'red';
  let label = '偏空，現在別買';
  if (rising === true && zone === 'high') {
    color = 'yellow';
    label = '偏多但過熱，別追高';
  } else if (rising === true && zone === 'low') {
    color = 'green';
    label = '低檔翻揚，偏多（較佳買點）';
  } else if (rising === true) {
    color = 'green';
    label = '偏多，可找買點';
  }

  return {
    light: { color, basis, dValue: round1(last.d), dRising: rising, zone, label },
    degraded,
  };
}

/** 切入點燈：用日 KD 的 D 線方向（替代三竹 60 分鐘線）。 */
function buildEntryLight(dayBars: Bar[]): KdEntryLight {
  const series = stochastic(dayBars);
  if (dayBars.length < MIN_BARS || series.length < 2) {
    return { color: 'gray', dValue: null, dRising: null, label: '短線資料不足' };
  }
  const last = series[series.length - 1];
  if (dRising(series) === true) {
    return { color: 'green', dValue: round1(last.d), dRising: true, label: '短線轉強，可切入' };
  }
  return { color: 'red', dValue: round1(last.d), dRising: false, label: '短線還弱，先等等' };
}

/** 兩盞燈合成「一句話 + 行動」（真值表）。 */
function combine(
  direction: KdDirectionLight,
  entry: KdEntryLight,
): Pick<KdVerdict, 'level' | 'headline' | 'action'> {
  if (direction.color === 'gray') {
    return {
      level: 'unknown',
      headline: '資料還不夠，暫時看不出來',
      action: '等這檔累積足夠交易資料再看',
    };
  }
  if (direction.color === 'red') {
    return { level: 'avoid', headline: '大方向往下，反彈別當買點', action: '現在不要買' };
  }
  if (direction.color === 'yellow') {
    if (entry.color === 'green') {
      return { level: 'wait', headline: '偏多但過熱，別追高', action: '不追高，等拉回再找買點' };
    }
    return { level: 'wait', headline: '過熱又轉弱，先別碰', action: '等拉回、短線回穩再看' };
  }
  // direction 為綠（偏多）
  if (entry.color === 'green') {
    return {
      level: 'buy',
      headline: '方向對、時機也到了',
      action: '可以考慮買進（分批進場、設好停損）',
    };
  }
  if (entry.color === 'gray') {
    return {
      level: 'wait',
      headline: '大方向偏多，但短線資料不足',
      action: '先觀望，等短線轉強再進',
    };
  }
  return {
    level: 'wait',
    headline: '方向對，但先等短線轉強再進',
    action: '先觀望，等「切入點」轉綠再進',
  };
}

/** 資料品質白話提示。 */
function buildNote(direction: KdDirectionLight, entry: KdEntryLight): string {
  const parts: string[] = [];
  if (direction.basis === 'month') {
    parts.push('大方向看月線');
  } else if (direction.basis === 'week') {
    parts.push('月線資料不足，改用週線判斷大方向');
  }
  if (entry.color === 'gray' && direction.color !== 'gray') {
    parts.push('短線資料不足');
  }
  return parts.join('；');
}

/**
 * 由完整日線 K 棒算出多週期 KD 紅綠燈結論。
 * @param points 完整日線（KlinePoint[] 亦可，結構相容 Bar）
 */
export function computeKdVerdict(points: Bar[]): KdVerdict {
  const dayBars = aggregate(points, 'day');
  const weekBars = aggregate(points, 'week');
  const monthBars = aggregate(points, 'month');

  const { light: direction, degraded } = buildDirectionLight(monthBars, weekBars);
  const entry = buildEntryLight(dayBars);
  const combined = combine(direction, entry);

  return {
    direction,
    entryTiming: entry,
    level: combined.level,
    headline: combined.headline,
    action: combined.action,
    confidenceNote: buildNote(direction, entry),
    disclaimer: STOCK_DISCLAIMER,
    degraded,
  };
}

/** K 線圖上的買/賣時機標記。 */
export interface KdMarker {
  /** 對齊的 K 棒日期 YYYY-MM-DD */
  date: string;
  kind: 'buy' | 'sell';
}

/**
 * 由 K 棒序列算出買/賣時機標記（與結論卡同一套 9 日 KD）：
 * - 買：KD 低檔黃金交叉（K 由下穿越 D，且 K < KD_GOLDEN_CROSS_MAX）
 * - 賣：KD 高檔死亡交叉（K 由上跌破 D，且 K > KD_DEAD_CROSS_MIN）
 * 傳入哪個週期的 Bar（日/週/月）就算該週期的標記，date 對齊原始 bar。
 */
export function computeKdMarkers(bars: Bar[]): KdMarker[] {
  const series = stochastic(bars);
  if (series.length < 2) {
    return [];
  }
  // stochastic 第一筆對應 bar 索引 = (KD_PERIOD-1)+(KD_SIGNAL-1)
  const offset = KD_PERIOD + KD_SIGNAL - 2;
  const markers: KdMarker[] = [];
  for (let j = 1; j < series.length; j++) {
    const barIdx = offset + j;
    if (barIdx >= bars.length) {
      break;
    }
    const prev = series[j - 1];
    const cur = series[j];
    const date = bars[barIdx].date;
    const goldenCross = prev.k <= prev.d && cur.k > cur.d;
    const deadCross = prev.k >= prev.d && cur.k < cur.d;
    if (goldenCross && cur.k < KD_GOLDEN_CROSS_MAX) {
      markers.push({ date, kind: 'buy' });
    } else if (deadCross && cur.k > KD_DEAD_CROSS_MIN) {
      markers.push({ date, kind: 'sell' });
    }
  }
  return markers;
}
