'use client';

import { useEffect, useRef } from 'react';
import type { IChartApi, SeriesMarker, Time } from 'lightweight-charts';

export interface EquityPoint {
  date: string;
  equity: number;
  buyHold: number | null;
}

/** 畫買/賣箭頭只需要進出場日期（其餘交易欄位不影響圖）。 */
export interface EquityTrade {
  entryDate: string;
  exitDate: string;
}

/** 由交易明細產生買/賣箭頭（升冪排序，lightweight-charts 要求）。 */
function buildMarkers(trades: EquityTrade[]): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = [];
  for (const t of trades) {
    markers.push({
      time: t.entryDate.slice(0, 10),
      position: 'belowBar',
      color: '#16a34a',
      shape: 'arrowUp',
      text: '買',
    });
    markers.push({
      time: t.exitDate.slice(0, 10),
      position: 'aboveBar',
      color: '#dc2626',
      shape: 'arrowDown',
      text: '賣',
    });
  }
  markers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  return markers;
}

/**
 * 權益曲線圖：策略（藍色面積）vs 買進持有（灰色虛線基準）。
 * 在策略線上以 ▲買 / ▼賣 箭頭標出每筆交易的進出場點（對應下方交易明細）。
 */
export function EquityCurveChart({
  points,
  trades = [],
}: {
  points: EquityPoint[];
  trades?: EquityTrade[];
}) {
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
      const { createChart, ColorType, CrosshairMode, LineStyle } = await import('lightweight-charts');
      if (disposed || !ref.current) {
        return;
      }
      chart = createChart(ref.current, {
        width: ref.current.clientWidth,
        height: 320,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#888' },
        grid: { vertLines: { color: '#eee' }, horzLines: { color: '#eee' } },
        timeScale: { borderColor: '#ddd', rightOffset: 4 },
        rightPriceScale: { borderColor: '#ddd' },
        crosshair: { mode: CrosshairMode.Normal },
      });

      // 策略：藍色面積（給圖「身體」，比兩條細線更有重量感）
      const strategy = chart.addAreaSeries({
        lineColor: '#2563eb',
        topColor: 'rgba(37, 99, 235, 0.25)',
        bottomColor: 'rgba(37, 99, 235, 0.02)',
        lineWidth: 2,
        title: '策略',
      });
      strategy.setData(points.map((p) => ({ time: p.date, value: Math.round(p.equity) })));

      // 買進持有：灰色虛線（一眼看出是「比較基準」）
      const buyHold = chart.addLineSeries({
        color: '#9ca3af',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: '買進持有',
      });
      buyHold.setData(
        points
          .filter((p) => p.buyHold != null)
          .map((p) => ({ time: p.date, value: Math.round(p.buyHold as number) })),
      );

      // 買/賣箭頭掛在策略線上（與下方交易明細一一對應）
      const markers = buildMarkers(trades);
      if (markers.length) {
        strategy.setMarkers(markers);
      }

      chart.timeScale().fitContent();

      onResize = () => {
        if (chart && ref.current) {
          chart.applyOptions({ width: ref.current.clientWidth });
        }
      };
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
  }, [points, trades]);

  return (
    <div>
      <div ref={ref} className="w-full" />
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="inline-flex items-center gap-3">
          <span>
            <span className="text-[#2563eb]">▬</span> 策略（照訊號買賣）
          </span>
          <span>
            <span className="text-[#9ca3af]">┄</span> 買進持有（基準）
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
            <p className="mb-1 font-semibold text-gray-700 dark:text-gray-200">這張圖在看什麼</p>
            <ul className="space-y-1">
              <li>
                <span className="text-[#2563eb]">藍色面積／藍線</span>＝照這個策略買賣後，你的資產變化。
              </li>
              <li>
                <span className="text-[#9ca3af]">灰色虛線</span>
                ＝一路抱著不賣（買進持有）的資產，當<b>比較基準</b>。
              </li>
              <li>
                <span className="text-[#16a34a]">▲ 買</span>＝進場那天、
                <span className="text-[#dc2626]">▼ 賣</span>＝出場那天，對應下方「交易明細」每一筆。
              </li>
              <li className="text-amber-600 dark:text-amber-400">
                💡 藍線在灰線<b>下方</b>＝這段期間策略「跑輸」一路抱著。
              </li>
              <li>把滑鼠移到線上，可看當天的資產金額。</li>
            </ul>
          </div>
        </span>

        <span className="text-xs text-gray-400">資料來源：FinMind</span>
      </div>
    </div>
  );
}
