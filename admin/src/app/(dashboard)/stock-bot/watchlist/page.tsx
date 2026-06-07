'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataSourceKey } from '@/config/data-sources';
import { DataSourceTag } from '@/components/stock/data-source-tag';
import { TermLabel } from '@/components/stock/term-label';
import { StockCombobox } from '../console/StockCombobox';

interface ApiResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

interface WatchRow {
  id: string;
  symbol: string;
  name: string | null;
  close: number | null;
  changePct: number | null;
  priceDate: string | null;
  score: number | null;
  action: string | null;
  verdictLevel: 'buy' | 'wait' | 'avoid' | 'unknown';
  verdictColor: 'green' | 'yellow' | 'red' | 'gray';
  verdictHeadline: string;
  targetPrice: number | null;
  stopPrice: number | null;
}

type SortKey = 'changePct' | 'score' | 'symbol';
type SortDir = 'asc' | 'desc';
type FilterKey = 'all' | 'scoreHigh' | 'scoreLow' | 'up' | 'down';

const SCORE_HIGH = 70;
const SCORE_LOW = 40;
/** 一鍵批次逐檔送出之間的節流間隔（ms），避免瞬間打爆佇列 API。 */
const BATCH_THROTTLE_MS = 400;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'scoreHigh', label: `評分高（≥${SCORE_HIGH}）` },
  { key: 'scoreLow', label: `評分低（≤${SCORE_LOW}）` },
  { key: 'up', label: '今日上漲' },
  { key: 'down', label: '今日下跌' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'changePct', label: '漲跌%' },
  { key: 'score', label: '評分' },
  { key: 'symbol', label: '代號' },
];

const VERDICT_DOT: Record<WatchRow['verdictColor'], string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  red: 'bg-red-500',
  gray: 'bg-gray-300',
};

async function apiGet<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  const json = (await res.json()) as ApiResult<T>;
  return json.success ? (json.data ?? null) : null;
}

async function apiPost<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ApiResult<T>;
}

async function apiPut<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ApiResult<T>;
}

/** 從下拉值（可能是「2330 台積電」）解析開頭台股代號（4–6 碼，含 ETF）。 */
function parseSymbol(value: string): string {
  const m = value.trim().match(/^\d{4,6}/);
  return m ? m[0] : value.trim();
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 將輸入字串轉成價格：空字串 → null；可解析數字 → number；其餘 → undefined（非法）。 */
function toPrice(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : undefined;
}

interface Draft {
  target: string;
  stop: string;
}

function draftFromRow(row: WatchRow): Draft {
  return {
    target: row.targetPrice != null ? String(row.targetPrice) : '',
    stop: row.stopPrice != null ? String(row.stopPrice) : '',
  };
}

export default function StockWatchlistPage() {
  const [rows, setRows] = useState<WatchRow[]>([]);
  const [stockOptions, setStockOptions] = useState<{ symbol: string; name: string }[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('changePct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [msg, setMsg] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const refresh = useCallback(async () => {
    const data = (await apiGet<WatchRow[]>('/api/v1/stock/watchlist/overview')) ?? [];
    setRows(data);
    setDrafts(Object.fromEntries(data.map((r) => [r.symbol, draftFromRow(r)])));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 載入全市場代號清單（供下拉搜尋）
  useEffect(() => {
    void (async () => {
      const data = await apiGet<{ symbol: string; name: string }[]>('/api/v1/stock/list');
      if (data) {
        setStockOptions(data);
      }
    })();
  }, []);

  const addWatch = async (raw: string) => {
    const sym = parseSymbol(raw);
    if (!sym) {
      return;
    }
    const res = await apiPost('/api/v1/stock/watchlist', { symbol: sym });
    if (!res.success) {
      setMsg(res.message || `${sym} 加入失敗`);
      return;
    }
    setMsg('');
    void refresh();
  };

  const removeWatch = async (id: string) => {
    await fetch(`/api/v1/stock/watchlist/${id}`, { method: 'DELETE' });
    void refresh();
  };

  const analyze = async (symbol: string) => {
    setMsg(`已送出 ${symbol} 分析，約 10 秒後自動更新…`);
    const res = await apiPost('/api/v1/stock/analyze', { symbol });
    if (!res.success) {
      setMsg(res.message || `${symbol} 分析觸發失敗`);
      return;
    }
    setTimeout(() => {
      void refresh();
      setMsg('');
    }, 10_000);
  };

  const research = async (symbol: string) => {
    setMsg(`已送出 ${symbol} 研究（AI 撰寫中），約 45 秒後自動更新…`);
    const res = await apiPost('/api/v1/stock/reports/generate', { symbol });
    if (!res.success) {
      setMsg(res.message || `${symbol} 研究觸發失敗`);
      return;
    }
    setTimeout(() => {
      void refresh();
      setMsg('');
    }, 45_000);
  };

  // 一鍵全部分析 / 研究：逐檔送出既有單檔 API，含節流與進度提示。
  const batchRun = async (kind: 'analyze' | 'research') => {
    if (batchBusy || rows.length === 0) {
      return;
    }
    setBatchBusy(true);
    const url = kind === 'analyze' ? '/api/v1/stock/analyze' : '/api/v1/stock/reports/generate';
    const label = kind === 'analyze' ? '分析' : '研究';
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setMsg(`全部${label}中…（${i + 1}/${rows.length}）${row.symbol}`);
      // eslint-disable-next-line no-await-in-loop -- 刻意逐檔節流送出，避免瞬間壓垮佇列 API
      await apiPost(url, { symbol: row.symbol });
      // eslint-disable-next-line no-await-in-loop -- 同上，逐檔之間節流
      await sleep(BATCH_THROTTLE_MS);
    }
    setMsg(`已送出全部${label}（共 ${rows.length} 檔），稍後自動更新…`);
    setBatchBusy(false);
    const delay = kind === 'analyze' ? 12_000 : 50_000;
    setTimeout(() => {
      void refresh();
      setMsg('');
    }, delay);
  };

  const saveTargets = async (symbol: string) => {
    const draft = drafts[symbol];
    if (!draft) {
      return;
    }
    const targetPrice = toPrice(draft.target);
    const stopPrice = toPrice(draft.stop);
    if (targetPrice === undefined || stopPrice === undefined) {
      setMsg(`${symbol}：目標 / 停損價需為數字或留空`);
      return;
    }
    const res = await apiPut('/api/v1/stock/watchlist/targets', {
      symbol,
      targetPrice,
      stopPrice,
    });
    if (!res.success) {
      setMsg(res.message || `${symbol} 目標 / 停損價設定失敗`);
      return;
    }
    setMsg('');
    void refresh();
  };

  const setDraft = (symbol: string, field: keyof Draft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [symbol]: { ...(prev[symbol] ?? { target: '', stop: '' }), [field]: value },
    }));
  };

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (filter === 'scoreHigh') {
        return r.score != null && r.score >= SCORE_HIGH;
      }
      if (filter === 'scoreLow') {
        return r.score != null && r.score <= SCORE_LOW;
      }
      if (filter === 'up') {
        return r.changePct != null && r.changePct > 0;
      }
      if (filter === 'down') {
        return r.changePct != null && r.changePct < 0;
      }
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'symbol') {
        return a.symbol.localeCompare(b.symbol) * dir;
      }
      // 數值排序：null 一律排在最後（不受方向影響）。
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) {
        return 0;
      }
      if (av == null) {
        return 1;
      }
      if (bv == null) {
        return -1;
      }
      return (av - bv) * dir;
    });
  }, [rows, filter, sortKey, sortDir]);

  const latestDate = useMemo(
    () =>
      rows.reduce<string | null>((latest, r) => {
        if (!r.priceDate) {
          return latest;
        }
        return latest && latest >= r.priceDate ? latest : r.priceDate;
      }, null),
    [rows],
  );

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">關注清單</h1>
        <p className="text-sm text-gray-500">
          管理關注股、排序 / 篩選、一鍵全部分析 / 研究，並設定目標價 / 停損價到價提醒。內容僅供參考，非投資建議。
        </p>
      </header>

      {/* 加入 + 一鍵批次 */}
      <section className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StockCombobox
            options={stockOptions}
            onSelect={(s) => addWatch(s)}
            placeholder="搜尋代號或名稱加入關注（如 2330 / 台積電）"
            className="w-72"
          />
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={() => batchRun('analyze')}
            disabled={batchBusy || rows.length === 0}
          >
            全部分析
          </button>
          <button
            type="button"
            className="rounded bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
            onClick={() => batchRun('research')}
            disabled={batchBusy || rows.length === 0}
          >
            全部研究
          </button>
          {msg && <span className="text-sm text-blue-600">{msg}</span>}
        </div>
      </section>

      {/* 排序 / 篩選 */}
      <section className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-500">排序</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`rounded px-2 py-1 text-sm ${
                sortKey === s.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
              onClick={() => setSortKey(s.key)}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            className="rounded bg-gray-100 px-2 py-1 text-sm text-gray-600"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            title="切換升冪 / 降冪"
          >
            {sortDir === 'asc' ? '↑ 升冪' : '↓ 降冪'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-sm text-gray-500">篩選</span>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`rounded px-2 py-1 text-sm ${
                filter === f.key ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* 表格 */}
      <section className="rounded-lg border p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1">代號 / 名稱</th>
                <th className="py-1 text-right">最新價</th>
                <th className="py-1 text-right">漲跌%</th>
                <th className="py-1 text-right">
                  <TermLabel termKey="HEALTH_SCORE" text="評分" />
                </th>
                <th className="py-1">
                  <TermLabel termKey="KD" text="紅綠燈結論" />
                </th>
                <th className="py-1 text-right">目標價</th>
                <th className="py-1 text-right">停損價</th>
                <th className="py-1 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const draft = drafts[r.symbol] ?? draftFromRow(r);
                return (
                  <tr key={r.id} className="border-t align-top">
                    <td className="whitespace-nowrap py-2">
                      <Link
                        href={`/stock-bot/stock/${r.symbol}`}
                        className="hover:underline"
                      >
                        {r.symbol}
                        {r.name ? `　${r.name}` : ''}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {r.close == null
                        ? '—'
                        : r.close.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {r.changePct == null ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className={r.changePct >= 0 ? 'text-red-600' : 'text-green-600'}>
                          {r.changePct >= 0 ? '▲' : '▼'}
                          {Math.abs(r.changePct)}%
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {r.score == null ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span
                          className={
                            r.score >= SCORE_HIGH
                              ? 'font-medium text-red-600'
                              : r.score <= SCORE_LOW
                                ? 'font-medium text-green-600'
                                : 'text-gray-700'
                          }
                        >
                          {r.score}
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <span
                          className={`inline-block size-2.5 shrink-0 rounded-full ${VERDICT_DOT[r.verdictColor]}`}
                        />
                        <span className="text-gray-600">{r.verdictHeadline}</span>
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        inputMode="decimal"
                        className="w-20 rounded border px-2 py-1 text-right text-sm"
                        placeholder="—"
                        value={draft.target}
                        onChange={(e) => setDraft(r.symbol, 'target', e.target.value)}
                        onBlur={() => saveTargets(r.symbol)}
                        onKeyDown={(e) => e.key === 'Enter' && saveTargets(r.symbol)}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        inputMode="decimal"
                        className="w-20 rounded border px-2 py-1 text-right text-sm"
                        placeholder="—"
                        value={draft.stop}
                        onChange={(e) => setDraft(r.symbol, 'stop', e.target.value)}
                        onBlur={() => saveTargets(r.symbol)}
                        onKeyDown={(e) => e.key === 'Enter' && saveTargets(r.symbol)}
                      />
                    </td>
                    <td className="whitespace-nowrap py-2">
                      <span className="flex justify-end gap-2">
                        <button className="text-blue-600" onClick={() => analyze(r.symbol)}>
                          分析
                        </button>
                        <button className="text-purple-600" onClick={() => research(r.symbol)}>
                          研究
                        </button>
                        <Link
                          href={`/stock-bot/stock/${r.symbol}`}
                          className="text-gray-600 hover:underline"
                        >
                          詳情
                        </Link>
                        <button className="text-red-600" onClick={() => removeWatch(r.id)}>
                          移除
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-3 text-gray-400">
                    {rows.length === 0 ? '尚無關注股' : '無符合篩選條件的股票'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataSourceTag source={DataSourceKey.FINMIND} date={latestDate} />
      </section>
    </div>
  );
}
