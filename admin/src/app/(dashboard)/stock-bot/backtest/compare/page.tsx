'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ComparisonResult } from '@azeroth/common';
import { apiGet, apiPost, sleep, type ApiResult } from '../_lib/api';
import { CompareForm, type CompareFormValues } from './CompareForm';
import { CompareResultView } from './CompareResultView';
import { pct } from './comparison-helpers';

interface BatchListItem {
  id: string;
  symbol: string;
  name: string | null;
  status: string;
  startDate: string;
  endDate: string;
  strategyCount: number;
  buyHoldPct: number | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 150; // ~5 分鐘
const TERMINAL = new Set(['done', 'partial', 'failed']);

function ComparePageInner() {
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get('symbol') ?? undefined;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<BatchListItem[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const pollAbort = useRef(false);

  const loadHistory = useCallback(async () => {
    const rows = await apiGet<BatchListItem[]>('/api/v1/stock/backtest/compare');
    setHistory(rows ?? []);
  }, []);

  useEffect(() => {
    void loadHistory();
    return () => {
      pollAbort.current = true;
    };
  }, [loadHistory]);

  const pollUntilDone = useCallback(
    async (batchId: string) => {
      pollAbort.current = false;
      for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        if (pollAbort.current) {
          return;
        }
        const row = await apiGet<ComparisonResult>(
          `/api/v1/stock/backtest/compare?batchId=${batchId}`,
        );
        if (row) {
          setResult(row); // 增量渲染（子列邊跑邊填）
          if (TERMINAL.has(row.status)) {
            void loadHistory();
            return;
          }
        }
        await sleep(POLL_INTERVAL_MS);
      }
      setError('比較逾時，請稍後到下方歷史列表查看結果。');
    },
    [loadHistory],
  );

  const run = useCallback(
    async (values: CompareFormValues) => {
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await apiPost<{ batchId: string }>('/api/v1/stock/backtest/compare', values);
        if (!res.success || !res.data) {
          setError(res.message || '比較啟動失敗');
          return;
        }
        await pollUntilDone(res.data.batchId);
      } catch (e) {
        setError(`比較失敗：${(e as Error).message}`);
      } finally {
        setLoading(false);
      }
    },
    [pollUntilDone],
  );

  const openHistory = useCallback(async (batchId: string) => {
    pollAbort.current = true;
    setError(null);
    try {
      const row = await apiGet<ComparisonResult>(
        `/api/v1/stock/backtest/compare?batchId=${batchId}`,
      );
      if (!row) {
        setError('無法開啟這次比較（可能已被刪除或無權限）。');
        return;
      }
      setResult(row);
    } catch (e) {
      setError(`開啟失敗：${(e as Error).message}`);
    }
  }, []);

  const deleteOne = useCallback(
    async (batchId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (pendingDelete) {
        return;
      }
      if (!window.confirm('確定刪除這次比較？（含其下各策略子回測）')) {
        return;
      }
      setPendingDelete(batchId);
      setError(null);
      try {
        const res = await fetch(`/api/v1/stock/backtest/compare?batchId=${batchId}`, {
          method: 'DELETE',
        });
        const json = (await res.json()) as ApiResult;
        if (!json.success) {
          setError(json.message || '刪除失敗');
          return;
        }
        setResult((cur) => (cur?.batchId === batchId ? null : cur));
        await loadHistory();
      } catch (err) {
        setError(`刪除失敗：${(err as Error).message}`);
      } finally {
        setPendingDelete(null);
      }
    },
    [pendingDelete, loadHistory],
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">策略比較</h1>
        <p className="mt-1 text-sm text-gray-500">
          同一檔股票一次跑多個策略，並排比績效（總報酬 / 年化 / 勝率 / 最大回撤 / 獲利因子），
          疊圖對照、並選出綜合冠軍。
        </p>
      </div>

      <CompareForm onRun={run} loading={loading} initialSymbol={initialSymbol} />

      {error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {result && <CompareResultView data={result} />}

      {history.length > 0 && (
        <div className="rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">
            歷史比較
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left">代號</th>
                  <th className="px-3 py-2 text-left">區間</th>
                  <th className="px-3 py-2">策略數</th>
                  <th className="px-3 py-2">買進持有</th>
                  <th className="px-3 py-2 text-left">狀態</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr
                    key={h.id}
                    className="cursor-pointer border-t hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    onClick={() => void openHistory(h.id)}
                  >
                    <td className="px-3 py-1.5 text-left">
                      {h.symbol} {h.name ?? ''}
                    </td>
                    <td className="px-3 py-1.5 text-left text-gray-500">
                      {h.startDate.slice(0, 10)} ~ {h.endDate.slice(0, 10)}
                    </td>
                    <td className="px-3 py-1.5">{h.strategyCount}</td>
                    <td className="px-3 py-1.5 text-gray-500">{pct(h.buyHoldPct)}</td>
                    <td className="px-3 py-1.5 text-left text-gray-500">{h.status}</td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        aria-label="刪除這次比較"
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

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">載入中…</div>}>
      <ComparePageInner />
    </Suspense>
  );
}
