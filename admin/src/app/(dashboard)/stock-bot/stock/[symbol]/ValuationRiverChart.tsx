'use client';

import { useEffect, useRef, useState } from 'react';
import type { IChartApi } from 'lightweight-charts';
import { PlainVerdict } from '@/components/stock/plain-verdict';
import { valuationVerdict } from '@/lib/beginner-verdict';
import { DataSourceTag } from '@/components/stock/data-source-tag';
import { DataSourceKey } from '@/config/data-sources';
import type { RiverBands, ValuationZone, ValuationMetric } from '@azeroth/common';

const METRICS: { key: ValuationMetric; label: string }[] = [
  { key: 'PER', label: '本益比河' },
  { key: 'PBR', label: '淨值比河' },
  { key: 'YIELD', label: '殖利率帶' },
];

interface ApiResult<T> {
  success: boolean;
  data?: T;
}
interface ValuationData {
  bands: RiverBands;
  zone: ValuationZone;
  asOf: string | null;
}

/** 估值河流圖：比率序列 + 歷史百分位水平 band + 位階白話結論。 */
export function ValuationRiverChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState<ValuationMetric>('PER');
  const [data, setData] = useState<ValuationData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    void (async () => {
      const res = await fetch(
        `/api/v1/stock/valuation?symbol=${encodeURIComponent(symbol)}&metric=${metric}`,
      );
      const json = (await res.json()) as ApiResult<ValuationData>;
      if (!active) {
        return;
      }
      setData(json.success ? (json.data ?? null) : null);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [symbol, metric]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !data) {
      return;
    }
    let chart: IChartApi | null = null;
    let disposed = false;
    let onResize: (() => void) | null = null;

    void (async () => {
      const { createChart, ColorType, LineStyle } = await import('lightweight-charts');
      if (disposed || !ref.current) {
        return;
      }
      chart = createChart(ref.current, {
        width: ref.current.clientWidth,
        height: 300,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#888' },
        grid: { vertLines: { color: '#eee' }, horzLines: { color: '#eee' } },
        rightPriceScale: { borderColor: '#ddd' },
        timeScale: { borderColor: '#ddd' },
      });

      const line = chart.addLineSeries({ color: '#2563eb', lineWidth: 2, priceLineVisible: false });
      const points = data.bands.dates
        .map((d, i) => ({ time: d, value: data.bands.series[i] }))
        .filter((x): x is { time: string; value: number } => x.value != null);
      line.setData(points);

      // 百分位水平 band：便宜(綠) → 昂貴(紅)
      const colors = ['#16a34a', '#65a30d', '#9ca3af', '#ea580c', '#dc2626'];
      data.bands.bands.forEach((b, i) => {
        line.createPriceLine({
          price: b.value,
          color: colors[i] ?? '#9ca3af',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: b.label,
        });
      });

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
  }, [data]);

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">估值河流圖</h3>
        <div className="inline-flex overflow-hidden rounded border text-xs">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`px-2 py-1 ${metric === m.key ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800'}`}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {data?.zone && (
        <p className="mb-2 text-sm">
          目前估值位階：
          <PlainVerdict tone={valuationVerdict(data.zone.zone).tone} className="ml-1">
            {valuationVerdict(data.zone.zone).text}
          </PlainVerdict>
          {data.zone.current != null && (
            <span className="ml-2 text-gray-500">
              {metric === 'YIELD' ? `殖利率 ${data.zone.current}%` : `${metric} ${data.zone.current}`}
              {data.zone.percentile != null && `（歷史百分位 ${data.zone.percentile}%）`}
            </span>
          )}
        </p>
      )}
      {loaded && !data && (
        <p className="text-sm text-gray-400">尚無估值資料（請先對該股「分析」累積歷史）</p>
      )}
      {data && <div ref={ref} className="w-full" />}
      <DataSourceTag source={DataSourceKey.FINMIND} date={data?.asOf ?? null} />
    </div>
  );
}
