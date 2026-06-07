'use client';

import { useEffect, useRef } from 'react';
import type { IChartApi } from 'lightweight-charts';
import type { BacktestEquityPoint } from '@azeroth/common';

export interface ComparisonSeries {
  label: string;
  color: string;
  points: BacktestEquityPoint[];
}

/** 多策略權益疊圖（每策略一條線 + 買進持有灰虛線基準）。 */
export function ComparisonChart({
  series,
  buyHold,
}: {
  series: ComparisonSeries[];
  buyHold: BacktestEquityPoint[] | null;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || series.length === 0) {
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
        height: 340,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#888' },
        grid: { vertLines: { color: '#eee' }, horzLines: { color: '#eee' } },
        timeScale: { borderColor: '#ddd', rightOffset: 4 },
        rightPriceScale: { borderColor: '#ddd' },
        crosshair: { mode: CrosshairMode.Normal },
      });

      for (const s of series) {
        const line = chart.addLineSeries({ color: s.color, lineWidth: 2, title: s.label });
        line.setData(s.points.map((p) => ({ time: p.date, value: Math.round(p.equity) })));
      }
      if (buyHold && buyHold.length) {
        const bh = chart.addLineSeries({
          color: '#9ca3af',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          title: '買進持有',
        });
        bh.setData(buyHold.map((p) => ({ time: p.date, value: Math.round(p.equity) })));
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
  }, [series, buyHold]);

  return (
    <div>
      <div ref={ref} className="w-full" />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1">
            <span style={{ color: s.color }} aria-hidden>
              ▬
            </span>
            {s.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="text-[#9ca3af]" aria-hidden>
            ┄
          </span>
          買進持有（基準）
        </span>
        <span className="text-gray-400">把滑鼠移到線上可看當天資產金額。</span>
      </div>
    </div>
  );
}
