'use client';

import {
  buildBacktestVerdict,
  type BacktestTone,
  type BacktestVerdictLevel,
} from '@/lib/backtest-verdict';
import { cn } from '@/utils/class-names';
import type { BacktestResultData } from './BacktestResultView';

/** 號誌語意燈點顏色（綠=好、黃=普通、紅=要注意）。 */
const DOT_CLASS: Record<BacktestTone, string> = {
  good: 'bg-green-500',
  neutral: 'bg-yellow-400',
  bad: 'bg-red-500',
};

/** 依綜合等級決定整張卡的色調（none 不會渲染，給灰色備用）。 */
const CARD_TONE: Record<BacktestVerdictLevel, string> = {
  good: 'border-green-500 bg-green-50 dark:bg-green-950/30',
  mixed: 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20',
  bad: 'border-red-500 bg-red-50 dark:bg-red-950/30',
  none: 'border-gray-300 bg-gray-50 dark:bg-gray-900',
};

function Light({
  icon,
  title,
  tone,
  label,
}: {
  icon: string;
  title: string;
  tone: BacktestTone;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-gray-500">
        {icon} {title}
      </span>
      <span className={cn('inline-block h-3 w-3 shrink-0 rounded-full', DOT_CLASS[tone])} />
      <span className="font-medium">{label}</span>
    </div>
  );
}

/**
 * 看圖小幫手（回測版）：把回測數字翻成紅綠燈白話結論卡。
 * 仿 console 的 StockVerdictCard，掛在結果數字卡上方（白話先行）。
 */
export function BacktestVerdictCard({ data }: { data: BacktestResultData }) {
  const verdict = buildBacktestVerdict({
    totalReturnPct: data.totalReturnPct,
    buyHoldPct: data.buyHoldPct,
    winRate: data.winRate,
    maxDrawdownPct: data.maxDrawdownPct,
    totalTrades: data.totalTrades,
  });

  if (verdict.level === 'none') {
    return null;
  }

  const asOf = data.endDate.slice(0, 10);

  return (
    <div className={cn('rounded-xl border p-4 text-sm', CARD_TONE[verdict.level])}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">
          看圖小幫手
          {data.symbol ? `・${data.symbol}` : ''}
          {data.name ? ` ${data.name}` : ''}
        </span>
        <span className="text-xs text-gray-400">資料來源：FinMind ｜ 資料截至 {asOf}</span>
      </div>

      <p className="mb-3 text-base font-bold">{verdict.headline}</p>

      <div className="grid gap-1.5 sm:grid-cols-2">
        {verdict.lights.map((l) => (
          <Light key={l.title} icon={l.icon} title={l.title} tone={l.tone} label={l.label} />
        ))}
      </div>

      <p className="mt-3 font-medium">👉 建議：{verdict.action}</p>

      <div className="mt-3 text-right text-xs text-gray-400">🟢 好・🟡 普通・🔴 要注意</div>
      <p className="mt-1 text-xs text-gray-400">
        ※ 歷史模擬，過去績效不代表未來，僅供參考、非投資建議。
      </p>
    </div>
  );
}
