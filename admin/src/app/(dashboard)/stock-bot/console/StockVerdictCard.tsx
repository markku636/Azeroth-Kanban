'use client';

import { useMemo, useState } from 'react';
import type { KdLightColor, KdVerdict } from '@azeroth/common';
import { computeKdVerdict } from '@/lib/kd-verdict';
import { cn } from '@/utils/class-names';
import type { KlinePoint } from './KlineChart';

/** 號誌語意燈點顏色（綠=可買、紅=別買、黃=過熱、灰=資料不足）。 */
const DOT_CLASS: Record<KdLightColor, string> = {
  green: 'bg-green-500',
  red: 'bg-red-500',
  yellow: 'bg-yellow-400',
  gray: 'bg-gray-300',
};

/** 依綜合等級決定整張卡的色調。 */
const CARD_TONE: Record<KdVerdict['level'], string> = {
  buy: 'border-green-500 bg-green-50 dark:bg-green-950/30',
  wait: 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20',
  avoid: 'border-red-500 bg-red-50 dark:bg-red-950/30',
  unknown: 'border-gray-300 bg-gray-50 dark:bg-gray-900',
};

function zoneLabel(zone: KdVerdict['direction']['zone']): string {
  if (zone === 'high') {
    return '高檔';
  }
  if (zone === 'low') {
    return '低檔';
  }
  return '中段';
}

function arrow(rising: boolean | null): string {
  if (rising === null) {
    return '';
  }
  return rising ? ' ↑' : ' ↓';
}

function Light({
  icon,
  title,
  color,
  label,
}: {
  icon: string;
  title: string;
  color: KdLightColor;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-gray-500">
        {icon} {title}
      </span>
      <span className={cn('inline-block h-3 w-3 shrink-0 rounded-full', DOT_CLASS[color])} />
      <span className="font-medium">{label}</span>
    </div>
  );
}

/**
 * 看圖小幫手：把多週期 KD 翻成「該不該買」的紅綠燈白話結論卡。
 * 由完整日線（points）即時計算，掛在 K 線圖上方。
 */
export function StockVerdictCard({
  points,
  symbol,
  name,
}: {
  points: KlinePoint[];
  symbol?: string;
  name?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const verdict = useMemo(() => computeKdVerdict(points), [points]);

  if (!points.length) {
    return null;
  }

  const asOf = points[points.length - 1]?.date ?? '';
  const { direction, entryTiming, headline, action, confidenceNote, disclaimer, level } = verdict;
  const basisLabel =
    direction.basis === 'month' ? '月線' : direction.basis === 'week' ? '週線' : '—';

  return (
    <div className={cn('mb-3 rounded-lg border p-4 text-sm', CARD_TONE[level])}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">
          看圖小幫手
          {symbol ? `・${symbol}` : ''}
          {name ? ` ${name}` : ''}
        </span>
        {asOf ? (
          <span className="text-xs text-gray-400">資料來源：FinMind ｜ 資料截至 {asOf}</span>
        ) : null}
      </div>

      <p className="mb-3 text-base font-bold">{headline}</p>

      <div className="space-y-1.5">
        <Light icon="🧭" title="大方向" color={direction.color} label={direction.label} />
        <Light icon="🎯" title="切入點" color={entryTiming.color} label={entryTiming.label} />
      </div>

      <p className="mt-3 font-medium">👉 建議：{action}</p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
        <button
          type="button"
          className="text-blue-600 hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '收合 KD 細節 ▴' : '展開看 KD 數字 ▾'}
        </button>
        <span>🟢=可考慮買・🔴=先別買・🟡=過熱別追</span>
      </div>

      {open ? (
        <div className="mt-2 rounded bg-white/60 p-2 text-xs text-gray-600 dark:bg-black/20">
          <p>
            大方向（{basisLabel}）D={direction.dValue ?? '—'}
            {arrow(direction.dRising)}（{zoneLabel(direction.zone)}）
          </p>
          <p>
            切入點（日線）D={entryTiming.dValue ?? '—'}
            {arrow(entryTiming.dRising)}
          </p>
          <p className="text-gray-400">黃線（D 線）向上=偏多、向下=偏空。KD 採台股經典 9 日。</p>
        </div>
      ) : null}

      {confidenceNote ? <p className="mt-2 text-xs text-gray-400">※ {confidenceNote}</p> : null}
      <p className="mt-1 text-xs text-gray-400">{disclaimer}</p>
    </div>
  );
}
