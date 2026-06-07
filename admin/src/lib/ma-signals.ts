/**
 * 均線（MA）跌破訊號與當前站上/跌破狀態。
 *
 * 「跌破」＝收盤價由上向下穿越某條均線（前一根 close ≥ MA 且當根 close < MA）。
 * 全程吃前端聚合好的 Bar[]、零外部依賴，與 KlineChart 畫的 MA 線同源（皆由收盤價即時重算）。
 * 不動 schema / worker / API。
 */

import type { Bar } from '@/lib/kline-aggregate';

/** 單條均線設定：週期、白話名稱、跌破標記文字、線色（與 KlineChart 圖例一致）。 */
export interface MaConfig {
  period: number;
  /** 白話名稱（月線 / 季線 / 半年線…） */
  label: string;
  /** 跌破箭頭文字（破月 / 破季…） */
  breakText: string;
  /** 線色（HEX） */
  color: string;
}

/** 圖上四條均線設定（顏色沿用既有 MA5/20/60，半年線新增桃紅）。 */
export const MA_CONFIGS: MaConfig[] = [
  { period: 5, label: '5日線', breakText: '破5', color: '#3b82f6' },
  { period: 20, label: '月線', breakText: '破月', color: '#f59e0b' },
  { period: 60, label: '季線', breakText: '破季', color: '#a855f7' },
  { period: 120, label: '半年線', breakText: '破半年', color: '#db2777' },
];

/** 單點 SMA（與 KlineChart / stock-service 同公式）：資料不足回 null。 */
function sma(values: number[], period: number, idx: number): number | null {
  if (idx + 1 < period) {
    return null;
  }
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    sum += values[i];
  }
  return Math.round((sum / period) * 100) / 100;
}

/** K 線圖上的「跌破均線」標記。 */
export interface MaBreakMarker {
  /** 對齊的 K 棒日期 YYYY-MM-DD */
  date: string;
  /** 被跌破的均線週期 */
  period: number;
  /** 標記文字（破月…） */
  breakText: string;
  /** 標記顏色（該均線色） */
  color: string;
}

/**
 * 逐均線、逐根偵測跌破（close 由上向下穿越 MA）。
 * @param bars   聚合後的 K 棒序列
 * @param periods 要偵測的均線週期（如 [5, 20, 60, 120]）
 */
export function computeMaBreakMarkers(bars: Bar[], periods: number[]): MaBreakMarker[] {
  if (bars.length < 2) {
    return [];
  }
  const closes = bars.map((b) => b.close);
  const configByPeriod = new Map(MA_CONFIGS.map((c) => [c.period, c]));
  const markers: MaBreakMarker[] = [];

  for (const period of periods) {
    const cfg = configByPeriod.get(period);
    if (!cfg) {
      continue;
    }
    for (let i = 1; i < bars.length; i++) {
      const prevMa = sma(closes, period, i - 1);
      const ma = sma(closes, period, i);
      if (prevMa == null || ma == null) {
        continue;
      }
      // 前一根站上、當根跌破 → 視為跌破事件
      if (closes[i - 1] >= prevMa && closes[i] < ma) {
        markers.push({ date: bars[i].date, period, breakText: cfg.breakText, color: cfg.color });
      }
    }
  }
  return markers;
}

/** 收盤價相對某條均線的當前狀態。 */
export type MaState = 'above' | 'below' | 'unknown';

/** 均線狀態列的單一項目。 */
export interface MaStatusItem {
  period: number;
  label: string;
  state: MaState;
  /** 該均線最新值（資料不足為 null） */
  maValue: number | null;
}

/**
 * 取最後一根，逐均線判定目前站上 / 跌破 / 資料不足。
 * @param bars   聚合後的 K 棒序列
 * @param periods 要判定的均線週期
 */
export function computeMaStatus(bars: Bar[], periods: number[]): MaStatusItem[] {
  const configByPeriod = new Map(MA_CONFIGS.map((c) => [c.period, c]));
  const closes = bars.map((b) => b.close);
  const lastIdx = bars.length - 1;

  return periods
    .map((period) => configByPeriod.get(period))
    .filter((cfg): cfg is MaConfig => cfg != null)
    .map((cfg) => {
      const maValue = lastIdx >= 0 ? sma(closes, cfg.period, lastIdx) : null;
      let state: MaState = 'unknown';
      if (maValue != null) {
        state = closes[lastIdx] >= maValue ? 'above' : 'below';
      }
      return { period: cfg.period, label: cfg.label, state, maValue };
    });
}
