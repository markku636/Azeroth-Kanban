'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataSourceKey } from '@/config/data-sources';
import { DataSourceTag } from '@/components/stock/data-source-tag';
import { TermLabel } from '@/components/stock/term-label';
import { BeginnerGuide } from '@/components/stock/beginner-guide';
import { PlainVerdict } from '@/components/stock/plain-verdict';
import { scoreVerdict } from '@/lib/beginner-verdict';
import { SCREEN_STRATEGIES, getStrategy, type ScreenRow } from '@/lib/screen-strategies';
import { listStrategies, type ScoringStrategyId } from '@azeroth/common';

interface ApiResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

function scoreColor(s: number) {
  return s >= 70 ? 'text-red-600 font-bold' : s <= 40 ? 'text-green-600' : 'text-gray-700';
}

type SortDir = 'asc' | 'desc';

/** 可排序基礎欄位的取值器（值型別決定排序方式，null 一律墊底）。 */
const SORT_ACCESSORS: Record<string, (r: ScreenRow) => string | number | null> = {
  symbol: (r) => r.symbol,
  name: (r) => r.name,
  score: (r) => r.score,
  action: (r) => r.action,
  chipScore: (r) => r.chipScore,
  per: (r) => r.per,
  revenueYoy: (r) => r.revenueYoy,
  dividendYield: (r) => r.dividendYield,
};

/** 依排序鍵與方向排序（不可變，null 墊底）。 */
function sortRows(rows: ScreenRow[], key: string, dir: SortDir): ScreenRow[] {
  const accessor = SORT_ACCESSORS[key];
  if (!accessor) {
    return rows;
  }
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    if (va == null && vb == null) {
      return 0;
    }
    if (va == null) {
      return 1;
    }
    if (vb == null) {
      return -1;
    }
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb) * factor;
    }
    return ((va as number) - (vb as number)) * factor;
  });
}

export default function StockScreenerPage() {
  const [strategy, setStrategy] = useState('all');
  const [scoring, setScoring] = useState<ScoringStrategyId>('balanced');
  const [rows, setRows] = useState<ScreenRow[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v1/stock/screener?strategy=${strategy}&scoring=${scoring}`);
    const json = (await res.json()) as ApiResult<{ rows: ScreenRow[]; asOf: string | null }>;
    setRows(json.success ? (json.data?.rows ?? []) : []);
    setAsOf(json.success ? (json.data?.asOf ?? null) : null);
    setLoading(false);
  }, [strategy, scoring]);

  useEffect(() => {
    void load();
  }, [load]);

  const scan = async () => {
    setMsg('已觸發股池掃描，worker 會逐檔分析並評分，稍後重新整理…');
    await fetch('/api/v1/stock/screen', { method: 'POST' });
  };

  const activeStrat = getStrategy(strategy);
  const baseColCount = 9;

  /** 點表頭：同欄 desc → asc → 取消；換欄則預設降冪。 */
  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('desc');
      return;
    }
    if (sortDir === 'desc') {
      setSortDir('asc');
      return;
    }
    setSortKey(null);
  };

  const sortedRows = useMemo(
    () => (sortKey ? sortRows(rows, sortKey, sortDir) : rows),
    [rows, sortKey, sortDir],
  );

  const sortArrow = (key: string) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">選股器 / 飆股雷達</h1>
        <select
          className="rounded border px-3 py-2 text-sm"
          aria-label="選股策略"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
        >
          {SCREEN_STRATEGIES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="rounded border px-3 py-2 text-sm"
          aria-label="評分策略"
          value={scoring}
          onChange={(e) => setScoring(e.target.value as ScoringStrategyId)}
        >
          {listStrategies().map((st) => (
            <option key={st.id} value={st.id}>
              評分：{st.name}
            </option>
          ))}
        </select>
        <button
          className="rounded bg-blue-600 px-3 py-2 text-sm text-white"
          onClick={() => load()}
        >
          重新整理
        </button>
        <button className="rounded bg-green-600 px-3 py-2 text-sm text-white" onClick={scan}>
          立即掃描股池
        </button>
        {loading && <span className="text-sm text-gray-400">載入中…</span>}
      </header>
      {msg && <p className="text-sm text-gray-500">{msg}</p>}

      <BeginnerGuide
        keys={[
          'HEALTH_SCORE',
          'ACTION',
          'CHIP_SCORE',
          'PER',
          'REVENUE_YOY',
          'DIVIDEND_YIELD',
          'MOMENTUM_STOCK',
          'INST_STREAK',
          'MA240',
          'MA_BULLISH',
          'PEG',
          'VALUATION_ZONE',
        ]}
      />
      <p className="text-xs text-gray-500">
        策略：<span className="font-medium">{activeStrat.label}</span>｜{activeStrat.description}
      </p>
      <p className="text-xs text-amber-600 dark:text-amber-400">
        💡 表格的「動作」是系統用技術指標算出的機械式訊號，僅供參考，非投資建議。
      </p>

      <section className="overflow-x-auto rounded-lg border p-4">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-gray-500 [&>th]:px-2 [&>th]:py-1">
              <th className="py-1">#</th>
              <th
                className="cursor-pointer select-none hover:text-gray-700"
                onClick={() => toggleSort('symbol')}
              >
                代號{sortArrow('symbol')}
              </th>
              <th
                className="cursor-pointer select-none hover:text-gray-700"
                onClick={() => toggleSort('name')}
              >
                名稱{sortArrow('name')}
              </th>
              <th
                className="cursor-pointer select-none hover:text-gray-700"
                onClick={() => toggleSort('score')}
              >
                <TermLabel termKey="HEALTH_SCORE" />
                {sortArrow('score')}
              </th>
              <th
                className="cursor-pointer select-none hover:text-gray-700"
                onClick={() => toggleSort('action')}
              >
                <TermLabel termKey="ACTION" />
                {sortArrow('action')}
              </th>
              <th
                className="cursor-pointer select-none hover:text-gray-700"
                onClick={() => toggleSort('chipScore')}
              >
                <TermLabel termKey="CHIP_SCORE" />
                {sortArrow('chipScore')}
              </th>
              <th
                className="cursor-pointer select-none hover:text-gray-700"
                onClick={() => toggleSort('per')}
              >
                <TermLabel termKey="PER" />
                {sortArrow('per')}
              </th>
              <th
                className="cursor-pointer select-none hover:text-gray-700"
                onClick={() => toggleSort('revenueYoy')}
              >
                <TermLabel termKey="REVENUE_YOY" text="營收YoY" />
                {sortArrow('revenueYoy')}
              </th>
              <th
                className="cursor-pointer select-none hover:text-gray-700"
                onClick={() => toggleSort('dividendYield')}
              >
                <TermLabel termKey="DIVIDEND_YIELD" />
                {sortArrow('dividendYield')}
              </th>
              {activeStrat.columns.map((c) => (
                <th key={c.header}>
                  {c.termKey ? <TermLabel termKey={c.termKey} text={c.header} /> : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, i) => {
              const sv = scoreVerdict(r.score);
              return (
                <tr key={r.symbol} className="border-t [&>td]:px-2 [&>td]:py-1">
                  <td className="py-1 text-gray-400">{i + 1}</td>
                  <td className="font-medium">
                    <Link
                      href={`/stock-bot/stock/${r.symbol}`}
                      className="text-blue-600 hover:underline"
                    >
                      {r.symbol}
                    </Link>
                  </td>
                  <td>{r.name ?? '—'}</td>
                  <td className="whitespace-nowrap">
                    <span className={scoreColor(r.score)}>{r.score}</span>
                    <PlainVerdict tone={sv.tone} className="ml-1.5">
                      {sv.text}
                    </PlainVerdict>
                  </td>
                  <td
                    className={
                      r.action === 'BUY'
                        ? 'text-red-600'
                        : r.action === 'SELL'
                          ? 'text-green-600'
                          : ''
                    }
                  >
                    {r.action}
                  </td>
                  <td>{r.chipScore ?? '—'}</td>
                  <td>{r.per ?? '—'}</td>
                  <td
                    className={
                      r.revenueYoy != null && r.revenueYoy >= 0 ? 'text-red-600' : 'text-green-600'
                    }
                  >
                    {r.revenueYoy != null ? `${r.revenueYoy}%` : '—'}
                  </td>
                  <td>{r.dividendYield != null ? `${r.dividendYield}%` : '—'}</td>
                  {activeStrat.columns.map((c) => {
                    const cell = c.render(r);
                    return (
                      <td key={c.header} className="whitespace-nowrap">
                        {cell.text}
                        {cell.verdict && (
                          <PlainVerdict tone={cell.verdict.tone} className="ml-1">
                            {cell.verdict.text}
                          </PlainVerdict>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={baseColCount + activeStrat.columns.length} className="py-3 text-gray-400">
                  尚無符合條件的個股（先按「立即掃描股池」讓 worker 評分）
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <DataSourceTag source={DataSourceKey.SYSTEM_SCORE} date={asOf} />
      </section>
    </div>
  );
}
