'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { listStrategyMeta, getStrategyMeta } from '@azeroth/common';
import { BeginnerGuide } from '@/components/stock/beginner-guide';
import { BacktestForm, type BacktestFormValues } from './BacktestForm';
import { BacktestResultView, type BacktestResultData } from './BacktestResultView';
import { apiGet, apiPost, sleep, type ApiResult } from './_lib/api';

interface RunListItem {
  id: string;
  symbol: string;
  name: string | null;
  strategy: string;
  status: string;
  startDate: string;
  endDate: string;
  totalReturnPct: number | null;
  winRate: number | null;
  totalTrades: number | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 90; // ~3 分鐘
const STRATEGIES = listStrategyMeta();

function strategyLabel(id: string): string {
  return getStrategyMeta(id)?.label ?? id;
}

function BacktestPageInner() {
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get('symbol') ?? undefined;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RunListItem[]>([]);
  const [strategyFilter, setStrategyFilter] = useState('all');
  /** 刪除中的 runId（'all' = 清除全部）；非 null 時鎖住刪除按鈕避免重複點擊 */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const pollAbort = useRef(false);

  const loadHistory = useCallback(async () => {
    const rows = await apiGet<RunListItem[]>('/api/v1/stock/backtest');
    setHistory(rows ?? []);
  }, []);

  useEffect(() => {
    void loadHistory();
    return () => {
      pollAbort.current = true;
    };
  }, [loadHistory]);

  const filteredHistory = useMemo(
    () => (strategyFilter === 'all' ? history : history.filter((h) => h.strategy === strategyFilter)),
    [history, strategyFilter],
  );

  const pollUntilDone = useCallback(
    async (runId: string) => {
      pollAbort.current = false;
      for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        if (pollAbort.current) {
          return;
        }
        const row = await apiGet<BacktestResultData>(`/api/v1/stock/backtest?runId=${runId}`);
        if (row) {
          setResult(row);
          if (row.status === 'done' || row.status === 'failed') {
            void loadHistory();
            return;
          }
        }
        await sleep(POLL_INTERVAL_MS);
      }
      setError('回測逾時，請稍後到下方歷史列表查看結果。');
    },
    [loadHistory],
  );

  const run = useCallback(
    async (values: BacktestFormValues) => {
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await apiPost<{ runId: string }>('/api/v1/stock/backtest', values);
        if (!res.success || !res.data) {
          setError(res.message || '回測啟動失敗');
          return;
        }
        await pollUntilDone(res.data.runId);
      } catch (e) {
        setError(`回測失敗：${(e as Error).message}`);
      } finally {
        setLoading(false);
      }
    },
    [pollUntilDone],
  );

  const openHistory = useCallback(async (runId: string) => {
    pollAbort.current = true;
    setError(null);
    try {
      const row = await apiGet<BacktestResultData>(`/api/v1/stock/backtest?runId=${runId}`);
      if (!row) {
        setError('無法開啟這筆回測（可能已被刪除或無權限）。');
        return;
      }
      setResult(row);
    } catch (e) {
      setError(`開啟失敗：${(e as Error).message}`);
    }
  }, []);

  const deleteOne = useCallback(
    async (runId: string, e: React.MouseEvent) => {
      e.stopPropagation(); // 不要觸發整列的 openHistory
      if (pendingDelete) {
        return;
      }
      if (!window.confirm('確定刪除這筆回測紀錄？')) {
        return;
      }
      setPendingDelete(runId);
      setError(null);
      try {
        const res = await fetch(`/api/v1/stock/backtest?runId=${runId}`, { method: 'DELETE' });
        const json = (await res.json()) as ApiResult;
        if (!json.success) {
          setError(json.message || '刪除失敗');
          return;
        }
        setResult((cur) => (cur?.id === runId ? null : cur));
        await loadHistory();
      } catch (err) {
        setError(`刪除失敗：${(err as Error).message}`);
      } finally {
        setPendingDelete(null);
      }
    },
    [pendingDelete, loadHistory],
  );

  const clearAll = useCallback(async () => {
    if (pendingDelete) {
      return;
    }
    if (!window.confirm('確定清除全部回測歷史？此動作無法復原。')) {
      return;
    }
    setPendingDelete('all');
    setError(null);
    try {
      const res = await fetch('/api/v1/stock/backtest?all=true', { method: 'DELETE' });
      const json = (await res.json()) as ApiResult;
      if (!json.success) {
        setError(json.message || '清除失敗');
        return;
      }
      setResult(null);
      await loadHistory();
    } catch (err) {
      setError(`清除失敗：${(err as Error).message}`);
    } finally {
      setPendingDelete(null);
    }
  }, [pendingDelete, loadHistory]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">策略回測</h1>
        <p className="mt-1 text-sm text-gray-500">
          用過去歷史股價模擬不同策略（KD / 均線 / MACD / RSI / 布林）會賺賠多少、勝率與風險。
          想一次比多個策略？到上方選單的「策略比較」。
        </p>
      </div>

      <BeginnerGuide
        keys={[
          'STRATEGY',
          'BACKTEST',
          'KD',
          'MA',
          'MACD',
          'RSI',
          'BOLLINGER',
          'WIN_RATE',
          'MAX_DRAWDOWN',
          'ANNUALIZED_RETURN',
          'PROFIT_FACTOR',
          'SHARPE',
          'BUY_HOLD',
        ]}
      />

      <BacktestForm onRun={run} loading={loading} initialSymbol={initialSymbol} />

      {error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {result && <BacktestResultView data={result} />}

      {history.length > 0 && (
        <div className="rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">歷史回測</span>
            <div className="flex items-center gap-2">
              <select
                aria-label="依策略篩選"
                title="依策略篩選"
                value={strategyFilter}
                onChange={(e) => setStrategyFilter(e.target.value)}
                className="rounded border px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
              >
                <option value="all">全部策略</option>
                {STRATEGIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void clearAll()}
                disabled={pendingDelete !== null}
                className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:hover:bg-rose-950/30"
              >
                {pendingDelete === 'all' ? '清除中…' : '清除全部'}
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left">代號</th>
                  <th className="px-3 py-2 text-left">策略</th>
                  <th className="px-3 py-2 text-left">區間</th>
                  <th className="px-3 py-2">總報酬</th>
                  <th className="px-3 py-2">勝率</th>
                  <th className="px-3 py-2">筆數</th>
                  <th className="px-3 py-2 text-left">狀態</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((h) => (
                  <tr
                    key={h.id}
                    className="cursor-pointer border-t hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    onClick={() => void openHistory(h.id)}
                  >
                    <td className="px-3 py-1.5 text-left">
                      {h.symbol} {h.name ?? ''}
                    </td>
                    <td className="px-3 py-1.5 text-left text-gray-500">{strategyLabel(h.strategy)}</td>
                    <td className="px-3 py-1.5 text-left text-gray-500">
                      {h.startDate.slice(0, 10)} ~ {h.endDate.slice(0, 10)}
                    </td>
                    <td
                      className={`px-3 py-1.5 ${
                        h.totalReturnPct == null
                          ? 'text-gray-400'
                          : h.totalReturnPct >= 0
                            ? 'text-rose-600'
                            : 'text-emerald-600'
                      }`}
                    >
                      {h.totalReturnPct != null ? `${h.totalReturnPct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      {h.winRate != null ? `${h.winRate.toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-3 py-1.5">{h.totalTrades ?? '—'}</td>
                    <td className="px-3 py-1.5 text-left text-gray-500">{h.status}</td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        aria-label="刪除這筆回測"
                        title="刪除"
                        disabled={pendingDelete !== null}
                        onClick={(e) => void deleteOne(h.id, e)}
                        className="rounded px-2 py-1 text-lg leading-none text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-950/30"
                      >
                        {pendingDelete === h.id ? '⏳' : '🗑'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BacktestPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">載入中…</div>}>
      <BacktestPageInner />
    </Suspense>
  );
}
