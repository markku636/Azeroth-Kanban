'use client';

import { useMemo, useState } from 'react';
import type { ComparisonRow } from '@azeroth/common';
import { TermLabel } from '@/components/stock/term-label';
import type { GlossaryKey } from '@/config/financial-glossary';
import { StatusChip } from './StatusChip';
import { bestWorst, gainCls } from './comparison-helpers';

interface MetricCol {
  key: string;
  label: string;
  glossaryKey?: GlossaryKey;
  lowerIsBetter?: boolean;
  /** 取排序 / best-worst 用的數值（done 才有） */
  get: (r: ComparisonRow) => number | null;
  fmt: (v: number | null) => string;
  colored?: boolean;
}

function fmtPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) {
    return '—';
  }
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

const COLUMNS: MetricCol[] = [
  {
    key: 'totalReturnPct',
    label: '總報酬',
    get: (r) => r.stats?.totalReturnPct ?? null,
    fmt: fmtPct,
    colored: true,
  },
  {
    key: 'annualizedPct',
    label: '年化',
    glossaryKey: 'ANNUALIZED_RETURN',
    get: (r) => r.stats?.annualizedPct ?? null,
    fmt: fmtPct,
    colored: true,
  },
  {
    key: 'winRate',
    label: '勝率',
    glossaryKey: 'WIN_RATE',
    get: (r) => r.stats?.winRate ?? null,
    fmt: (v) => (v == null ? '—' : `${v.toFixed(0)}%`),
  },
  {
    key: 'maxDrawdownPct',
    label: '最大回撤',
    glossaryKey: 'MAX_DRAWDOWN',
    lowerIsBetter: true,
    get: (r) => r.stats?.maxDrawdownPct ?? null,
    fmt: (v) => (v == null ? '—' : `-${v.toFixed(1)}%`),
  },
  {
    key: 'profitFactor',
    label: '獲利因子',
    glossaryKey: 'PROFIT_FACTOR',
    get: (r) => (r.stats ? (r.stats.profitFactor ?? Infinity) : null),
    fmt: (v) => (v == null ? '—' : v === Infinity ? '∞' : v.toFixed(2)),
  },
  {
    key: 'totalTrades',
    label: '交易數',
    get: (r) => r.stats?.totalTrades ?? null,
    fmt: (v) => (v == null ? '—' : String(v)),
  },
];

export function ComparisonTable({
  rows,
  buyHoldPct,
  championRunId,
}: {
  rows: ComparisonRow[];
  buyHoldPct: number | null;
  championRunId: string | null;
}) {
  const [sortKey, setSortKey] = useState('annualizedPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const doneRows = useMemo(() => rows.filter((r) => r.status === 'done' && r.stats), [rows]);
  const otherRows = useMemo(() => rows.filter((r) => r.status !== 'done' || !r.stats), [rows]);

  const col = COLUMNS.find((c) => c.key === sortKey) ?? COLUMNS[1];
  const sortedDone = useMemo(() => {
    const arr = [...doneRows];
    arr.sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      const na = va == null || !Number.isFinite(va) ? -Infinity : va;
      const nb = vb == null || !Number.isFinite(vb) ? -Infinity : vb;
      return sortDir === 'asc' ? na - nb : nb - na;
    });
    return arr;
  }, [doneRows, col, sortDir]);

  // best/worst（以 done 列為準，依各欄 lowerIsBetter）
  const marks = useMemo(() => {
    const map: Record<string, { best: number; worst: number }> = {};
    for (const c of COLUMNS) {
      map[c.key] = bestWorst(
        doneRows.map((r) => c.get(r)),
        c.lowerIsBetter,
      );
    }
    return map;
  }, [doneRows]);

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  /** done 列的 runId → 在 doneRows 中的索引（best/worst 比對用） */
  const doneIndex = useMemo(() => {
    const m = new Map<string, number>();
    doneRows.forEach((r, i) => m.set(r.runId, i));
    return m;
  }, [doneRows]);

  return (
    <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-900">
      <table className="w-full min-w-[640px] text-right text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-800">
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left dark:bg-gray-800">
              策略
            </th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="cursor-pointer select-none px-3 py-2 hover:text-blue-600"
                onClick={() => toggleSort(c.key)}
              >
                {c.glossaryKey ? <TermLabel termKey={c.glossaryKey} text={c.label} /> : c.label}
                <span aria-hidden>{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* 買進持有基準列 */}
          <tr className="border-t bg-gray-50/60 text-gray-500 dark:border-gray-700 dark:bg-gray-800/40">
            <td className="sticky left-0 z-10 bg-gray-50/60 px-3 py-1.5 text-left dark:bg-gray-800/40">
              買進持有（基準）
            </td>
            <td className={`px-3 py-1.5 ${gainCls(buyHoldPct)}`}>{fmtPct(buyHoldPct)}</td>
            <td className="px-3 py-1.5">—</td>
            <td className="px-3 py-1.5">—</td>
            <td className="px-3 py-1.5">—</td>
            <td className="px-3 py-1.5">—</td>
            <td className="px-3 py-1.5">—</td>
          </tr>

          {sortedDone.map((r) => {
            const di = doneIndex.get(r.runId) ?? -1;
            const isChampion = r.runId === championRunId;
            return (
              <tr
                key={r.runId}
                className={`border-t dark:border-gray-700 ${
                  isChampion ? 'bg-amber-50 dark:bg-amber-950/20' : ''
                }`}
              >
                <td
                  className={`sticky left-0 z-10 px-3 py-1.5 text-left font-medium ${
                    isChampion
                      ? 'bg-amber-50 dark:bg-amber-950/20'
                      : 'bg-white dark:bg-gray-900'
                  }`}
                >
                  {isChampion && <span aria-label="冠軍">👑 </span>}
                  {r.label}
                </td>
                {COLUMNS.map((c) => {
                  const v = c.get(r);
                  const mk = marks[c.key];
                  const isBest = di >= 0 && mk.best === di;
                  const isWorst = di >= 0 && mk.worst === di;
                  const ring = isBest
                    ? 'ring-1 ring-rose-400'
                    : isWorst
                      ? 'ring-1 ring-emerald-400'
                      : '';
                  return (
                    <td key={c.key} className="px-1 py-1.5">
                      <span
                        className={`inline-block rounded px-2 py-0.5 ${ring} ${
                          c.colored ? gainCls(v) : ''
                        }`}
                        aria-label={isBest ? '本欄最佳' : isWorst ? '本欄最差' : undefined}
                      >
                        {c.fmt(v)}
                        {isBest && <span aria-hidden> ▲</span>}
                        {isWorst && <span aria-hidden> ▼</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {/* 未完成 / 失敗列 */}
          {otherRows.map((r) => (
            <tr key={r.runId} className="border-t text-gray-400 dark:border-gray-700">
              <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left dark:bg-gray-900">
                {r.label} <StatusChip status={r.status} />
                {r.status === 'failed' && r.error && (
                  <span className="ml-1 text-xs text-rose-500" title={r.error}>
                    ✕
                  </span>
                )}
              </td>
              <td className="px-3 py-1.5">—</td>
              <td className="px-3 py-1.5">—</td>
              <td className="px-3 py-1.5">—</td>
              <td className="px-3 py-1.5">—</td>
              <td className="px-3 py-1.5">—</td>
              <td className="px-3 py-1.5">—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
