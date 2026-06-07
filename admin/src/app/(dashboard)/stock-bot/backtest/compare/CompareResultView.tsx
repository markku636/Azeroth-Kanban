'use client';

import { useMemo } from 'react';
import { STOCK_DISCLAIMER, type ComparisonResult } from '@azeroth/common';
import { BeginnerGuide } from '@/components/stock/beginner-guide';
import { buildBacktestVerdict } from '@/lib/backtest-verdict';
import { ComparisonTable } from './ComparisonTable';
import { ComparisonChart, type ComparisonSeries } from './ComparisonChart';
import { colorForIndex, dateOnly, pct } from './comparison-helpers';

/** 依批次狀態給出橫幅（done 不顯示）。 */
function StatusBanner({ data }: { data: ComparisonResult }) {
  const total = data.rows.length;
  const done = data.rows.filter((r) => r.status === 'done').length;
  const failed = data.rows.filter((r) => r.status === 'failed').length;

  if (data.status === 'pending' || data.status === 'running') {
    return (
      <div className="rounded-lg border bg-white p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900">
        比較進行中…（{done}/{total} 完成）狀態會自動更新。
      </div>
    );
  }
  if (data.status === 'failed') {
    return (
      <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
        比較失敗：{data.rows.find((r) => r.error)?.error ?? '所有策略皆無法完成'}
      </div>
    );
  }
  if (data.status === 'partial') {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        部分完成：{failed} 個策略失敗（已排除於排名與圖表），其餘 {done} 個正常。
      </div>
    );
  }
  return null;
}

export function CompareResultView({ data }: { data: ComparisonResult }) {
  const champion = useMemo(
    () => data.rows.find((r) => r.runId === data.championRunId) ?? null,
    [data.rows, data.championRunId],
  );

  // 圖表 series：只畫 done 且有曲線者，依列順序配色
  const series = useMemo<ComparisonSeries[]>(() => {
    const out: ComparisonSeries[] = [];
    let i = 0;
    for (const r of data.rows) {
      if (r.status === 'done' && r.equityCurve && r.equityCurve.length > 0) {
        out.push({ label: r.label, color: colorForIndex(i), points: r.equityCurve });
      }
      i++;
    }
    return out;
  }, [data.rows]);

  const championVerdict = champion?.stats
    ? buildBacktestVerdict({
        totalReturnPct: champion.stats.totalReturnPct,
        buyHoldPct: data.buyHoldPct,
        winRate: champion.stats.winRate,
        maxDrawdownPct: champion.stats.maxDrawdownPct,
        totalTrades: champion.stats.totalTrades,
      })
    : null;

  return (
    <div className="space-y-4">
      <StatusBanner data={data} />

      {/* 冠軍卡 */}
      {champion && champion.stats ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-700 dark:bg-amber-950/20">
          <div className="text-sm text-amber-700 dark:text-amber-300">👑 綜合冠軍</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              {champion.label}
            </span>
            <span className="text-lg font-semibold text-rose-600">
              年化 {pct(champion.stats.annualizedPct)}
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              總報酬 {pct(champion.stats.totalReturnPct)}、勝率{' '}
              {champion.stats.winRate.toFixed(0)}%、最大回撤 -{champion.stats.maxDrawdownPct.toFixed(1)}%
            </span>
          </div>
          {championVerdict && (
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
              {championVerdict.headline}　<span className="text-gray-500">{championVerdict.action}</span>
            </p>
          )}
        </div>
      ) : (
        data.status === 'done' && (
          <div className="rounded-lg border bg-white p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900">
            本批<b>無策略勝出買進持有</b>（{pct(data.buyHoldPct)}）。直接買進持有可能是更省力的選擇。
          </div>
        )
      )}

      {/* 並排比較表 */}
      <div>
        <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          {data.symbol} {data.name ?? ''}　各策略績效並排（點欄位標題可排序）
        </div>
        <ComparisonTable
          rows={data.rows}
          buyHoldPct={data.buyHoldPct}
          championRunId={data.championRunId}
        />
        {data.globalStartDate && (
          <p className="mt-1 text-xs text-gray-400">
            ※ 為公平比較，所有策略自 <b>{dateOnly(data.globalStartDate)}</b> 起算（依最長暖身對齊），
            並與同期買進持有對照。
          </p>
        )}
      </div>

      {/* 多策略疊圖 */}
      {series.length > 0 && (
        <div className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            資產變化疊圖（各策略 vs 買進持有）
          </div>
          <ComparisonChart series={series} buyHold={data.buyHoldCurve} />
        </div>
      )}

      <BeginnerGuide
        keys={[
          'STRATEGY_COMPARISON',
          'STRATEGY',
          'WIN_RATE',
          'ANNUALIZED_RETURN',
          'MAX_DRAWDOWN',
          'PROFIT_FACTOR',
          'BUY_HOLD',
        ]}
      />

      <p className="text-xs leading-relaxed text-gray-400">
        ※ 結果為歷史模擬，過去績效不代表未來。
        <br />
        {STOCK_DISCLAIMER}
      </p>
    </div>
  );
}
