'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { IChartApi, SeriesMarker, Time } from 'lightweight-charts';
import { aggregate, type Period } from '@/lib/kline-aggregate';
import { computeKdMarkers } from '@/lib/kd-verdict';
import {
  MA_CONFIGS,
  computeMaBreakMarkers,
  computeMaStatus,
  type MaState,
} from '@/lib/ma-signals';

export type { Period };

/** 均線狀態 chip 的樣式與圖示（站上=綠 / 跌破=紅 / 資料不足=灰）。 */
const MA_STATE_STYLE: Record<MaState, { cls: string; icon: string }> = {
  above: {
    cls: 'border-green-300 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
    icon: '✓',
  },
  below: {
    cls: 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    icon: '✗',
  },
  unknown: {
    cls: 'border-gray-300 bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    icon: '—',
  },
};

/** 均線狀態的白話文字（站上月線 / 跌破季線 / 半年線資料不足）。 */
function maStatusText(state: MaState, label: string): string {
  if (state === 'above') {
    return `站上${label}`;
  }
  if (state === 'below') {
    return `跌破${label}`;
  }
  return `${label}資料不足`;
}

export interface KlinePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
}

function sma(values: number[], period: number, idx: number): number | null {
  if (idx + 1 < period) {
    return null;
  }
  let s = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    s += values[i];
  }
  return Math.round((s / period) * 100) / 100;
}

/** TradingView lightweight-charts K 線圖（紅漲綠跌 + 成交量 + MA5/20/60）。 */
export function KlineChart({ points, period = 'day' }: { points: KlinePoint[]; period?: Period }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !points.length) {
      return;
    }
    let chart: IChartApi | null = null;
    let disposed = false;
    let onResize: (() => void) | null = null;

    void (async () => {
      const { createChart, ColorType, CrosshairMode } = await import('lightweight-charts');
      if (disposed || !ref.current) {
        return;
      }
      chart = createChart(ref.current, {
        width: ref.current.clientWidth,
        height: 380,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#888' },
        grid: { vertLines: { color: '#eee' }, horzLines: { color: '#eee' } },
        timeScale: { borderColor: '#ddd', rightOffset: 4 },
        rightPriceScale: { borderColor: '#ddd' },
        crosshair: { mode: CrosshairMode.Normal },
      });

      const agg = aggregate(points, period);

      const candles = chart.addCandlestickSeries({
        upColor: '#d9001b',
        downColor: '#1f8a37',
        borderVisible: false,
        wickUpColor: '#d9001b',
        wickDownColor: '#1f8a37',
      });
      candles.setData(
        agg.map((d) => ({ time: d.date, open: d.open, high: d.high, low: d.low, close: d.close })),
      );

      const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(
        agg.map((d) => ({
          time: d.date,
          value: d.volume,
          color: d.close >= d.open ? 'rgba(217,0,27,0.35)' : 'rgba(31,138,55,0.35)',
        })),
      );

      const closes = agg.map((d) => d.close);
      const addMa = (p: number, color: string) => {
        const s = chart!.addLineSeries({
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        s.setData(
          agg
            .map((d, i) => ({ time: d.date, value: sma(closes, p, i) }))
            .filter((x): x is { time: string; value: number } => x.value != null),
        );
      };
      addMa(5, '#3b82f6');
      addMa(20, '#f59e0b');
      addMa(60, '#a855f7');
      addMa(120, '#db2777');

      // 買/賣箭頭：KD 低檔黃金交叉=買、高檔死亡交叉=賣（與結論卡同一套 9 日 KD）
      const kdMarkers: SeriesMarker<Time>[] = computeKdMarkers(agg).map((m) => ({
        time: m.date,
        position: m.kind === 'buy' ? 'belowBar' : 'aboveBar',
        color: m.kind === 'buy' ? '#16a34a' : '#dc2626',
        shape: m.kind === 'buy' ? 'arrowUp' : 'arrowDown',
        text: m.kind === 'buy' ? '買' : '賣',
      }));
      // 跌破均線箭頭（破5/破月/破季/破半年）：命名僅日線有意義，故只在日線標
      const maMarkers: SeriesMarker<Time>[] =
        period === 'day'
          ? computeMaBreakMarkers(
              agg,
              MA_CONFIGS.map((c) => c.period),
            ).map((m) => ({
              time: m.date,
              position: 'aboveBar' as const,
              color: m.color,
              shape: 'arrowDown' as const,
              text: m.breakText,
            }))
          : [];
      // setMarkers 整張圖只能呼叫一次 → 合併買賣與跌破箭頭並依時間排序
      const markerData = [...kdMarkers, ...maMarkers].sort((a, b) =>
        String(a.time).localeCompare(String(b.time)),
      );
      if (markerData.length) {
        candles.setMarkers(markerData);
      }

      chart.timeScale().fitContent();
      onResize = () =>
        chart && ref.current && chart.applyOptions({ width: ref.current.clientWidth });
      window.addEventListener('resize', onResize);
    })();

    return () => {
      disposed = true;
      if (onResize) {
        window.removeEventListener('resize', onResize);
      }
      if (chart) {
        chart.remove();
      }
    };
  }, [points, period]);

  // 均線站上/跌破狀態列（命名僅日線有意義，故只在日線顯示）
  const maStatus = useMemo(() => {
    if (period !== 'day' || !points.length) {
      return [];
    }
    return computeMaStatus(
      aggregate(points, period),
      MA_CONFIGS.map((c) => c.period),
    );
  }, [points, period]);

  if (!points.length) {
    return <p className="text-sm text-gray-400">尚無 K 線資料（請先對該股「分析」）</p>;
  }
  return (
    <div>
      {maStatus.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          {maStatus.map((s) => {
            const style = MA_STATE_STYLE[s.state];
            return (
              <span
                key={s.period}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${style.cls}`}
              >
                <span>{style.icon}</span>
                <span>{maStatusText(s.state, s.label)}</span>
              </span>
            );
          })}
        </div>
      )}
      <div ref={ref} className="w-full" />
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="inline-flex items-center gap-2">
          <span>
            <span className="text-[#3b82f6]">—</span> MA5
          </span>
          <span>
            <span className="text-[#f59e0b]">—</span> MA20
          </span>
          <span>
            <span className="text-[#a855f7]">—</span> MA60
          </span>
          <span>
            <span className="text-[#db2777]">—</span> MA120
          </span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span>
            <span className="text-[#d9001b]">■</span> 漲
          </span>
          <span>
            <span className="text-[#1f8a37]">■</span> 跌
          </span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span>
            <span className="text-[#16a34a]">▲</span>買
          </span>
          <span>
            <span className="text-[#dc2626]">▼</span>賣
          </span>
        </span>

        {/* 圖例說明浮窗：桌機滑過、手機點擊聚焦皆可顯示（純 CSS，無額外依賴） */}
        <span className="group relative inline-block">
          <button
            type="button"
            aria-label="圖例說明"
            className="cursor-help rounded-full border border-blue-300 px-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
          >
            ？圖例說明
          </button>
          <div
            role="tooltip"
            className="invisible absolute bottom-full left-0 z-20 mb-1 w-72 max-w-[90vw] rounded-lg border bg-white p-3 text-left leading-relaxed text-gray-600 opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 dark:bg-gray-800 dark:text-gray-300"
          >
            <p className="mb-1 font-semibold text-gray-700 dark:text-gray-200">這張圖的顏色</p>
            <ul className="space-y-1">
              <li>
                <span className="text-[#d9001b]">🔴 紅蠟燭</span>＝當天漲、
                <span className="text-[#1f8a37]">🟢 綠蠟燭</span>＝當天跌（台股紅漲綠跌）
              </li>
              <li>
                <span className="text-[#3b82f6]">— 藍 MA5</span>：近 5 日均價（最靈敏）
              </li>
              <li>
                <span className="text-[#f59e0b]">— 橙 MA20</span>：近 20 日（俗稱月線）
              </li>
              <li>
                <span className="text-[#a855f7]">— 紫 MA60</span>：近 60 日（俗稱季線）
              </li>
              <li>
                <span className="text-[#db2777]">— 桃 MA120</span>：近 120 日（俗稱半年線）
              </li>
              <li>
                均線都往上、藍＞橙＞紫＞桃＝<b>多頭排列（偏強）</b>
              </li>
              <li>
                K 棒上方<b>向下箭頭</b>（破5/破月/破季/破半年）＝當天收盤<b>跌破該均線</b>（偏空訊號）
              </li>
              <li>
                圖上方色塊＝目前股價<b>站上（綠✓）/ 跌破（紅✗）</b>各條均線的狀態
              </li>
              <li>
                下方紅綠柱＝<b>成交量</b>，越高代表當天買賣越熱
              </li>
              <li>
                <span className="text-[#16a34a]">▲ 綠買</span>／
                <span className="text-[#dc2626]">▼ 紅賣</span>＝系統抓到的買賣時機（KD
                低檔翻揚買、高檔轉弱賣）
              </li>
              <li className="text-amber-600 dark:text-amber-400">
                💡 蠟燭紅綠看「漲跌」；箭頭<b>綠買紅賣</b>（與上面卡片燈號一致）
              </li>
            </ul>
          </div>
        </span>

        <span className="text-xs text-gray-400">資料來源：FinMind</span>
      </div>
    </div>
  );
}
