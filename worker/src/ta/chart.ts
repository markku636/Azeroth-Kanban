/**
 * 伺服器端 K 線圖出圖（echarts SSR + @napi-rs/canvas → PNG Buffer）。
 * 產出供 Gemini vision 判讀，以及 LINE 圖片訊息。
 */
import type { StockOhlcv } from '@azeroth/common';
import * as echarts from 'echarts';
import { createCanvas } from '@napi-rs/canvas';
import { maSeries } from './indicators.js';

// 讓 echarts 在 Node 環境用 napi canvas 建圖
echarts.setPlatformAPI({
  createCanvas: (width?: number, height?: number) => createCanvas(width ?? 1, height ?? 1),
});

export interface RenderChartOptions {
  width?: number;
  height?: number;
  title?: string;
}

/** 畫日 K + MA5/MA20/MA60 疊圖，回傳 PNG Buffer。 */
export function renderKlineChart(
  symbol: string,
  ohlcv: StockOhlcv[],
  opts: RenderChartOptions = {},
): Buffer {
  const width = opts.width ?? 1000;
  const height = opts.height ?? 560;
  const canvas = createCanvas(width, height);

  const chart = echarts.init(
    canvas as unknown as Parameters<typeof echarts.init>[0],
    undefined,
    { width, height },
  );

  const dates = ohlcv.map((o) => o.date);
  // echarts candlestick 資料順序為 [open, close, low, high]
  const candles = ohlcv.map((o) => [o.open, o.close, o.low, o.high]);
  const ma = (p: number) => maSeries(ohlcv, p).map((v) => (v == null ? '-' : Math.round(v * 100) / 100));

  chart.setOption({
    animation: false,
    backgroundColor: '#ffffff',
    title: { text: opts.title ?? `${symbol} 日K`, left: 'center', textStyle: { fontSize: 16 } },
    grid: [
      { left: 56, right: 24, top: 48, height: '58%' },
      { left: 56, right: 24, top: '74%', height: '16%' },
    ],
    xAxis: [
      { type: 'category', data: dates, boundaryGap: true, axisLabel: { show: true }, gridIndex: 0 },
      { type: 'category', data: dates, gridIndex: 1, axisLabel: { show: false } },
    ],
    yAxis: [
      { scale: true, gridIndex: 0 },
      { scale: true, gridIndex: 1, axisLabel: { show: false } },
    ],
    legend: { data: ['K線', 'MA5', 'MA20', 'MA60'], top: 24 },
    series: [
      {
        name: 'K線',
        type: 'candlestick',
        data: candles,
        itemStyle: {
          color: '#d9001b', color0: '#1f8a37',
          borderColor: '#d9001b', borderColor0: '#1f8a37',
        },
        xAxisIndex: 0, yAxisIndex: 0,
      },
      { name: 'MA5', type: 'line', data: ma(5), smooth: true, showSymbol: false, lineStyle: { width: 1 }, xAxisIndex: 0, yAxisIndex: 0 },
      { name: 'MA20', type: 'line', data: ma(20), smooth: true, showSymbol: false, lineStyle: { width: 1 }, xAxisIndex: 0, yAxisIndex: 0 },
      { name: 'MA60', type: 'line', data: ma(60), smooth: true, showSymbol: false, lineStyle: { width: 1 }, xAxisIndex: 0, yAxisIndex: 0 },
      {
        name: '成交量', type: 'bar',
        data: ohlcv.map((o) => o.volume),
        xAxisIndex: 1, yAxisIndex: 1,
        itemStyle: { color: '#9aa7b1' },
      },
    ],
  });

  const buffer = canvas.toBuffer('image/png');
  chart.dispose();
  return buffer;
}
