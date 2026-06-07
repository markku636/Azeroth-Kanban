'use client';

import { useCallback, useEffect, useState } from 'react';

interface AlertRow {
  id: string;
  symbol: string;
  type: string;
  threshold: number;
  isActive: boolean;
  lastTriggeredAt: string | null;
}

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'PRICE_ABOVE', label: '價格 ≥' },
  { value: 'PRICE_BELOW', label: '價格 ≤' },
  { value: 'RSI_ABOVE', label: 'RSI ≥' },
  { value: 'RSI_BELOW', label: 'RSI ≤' },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState('PRICE_ABOVE');
  const [threshold, setThreshold] = useState('');

  const refresh = useCallback(async () => {
    const res = await fetch('/api/v1/stock/alerts');
    const json = await res.json();
    setAlerts(json.success ? (json.data ?? []) : []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async () => {
    if (!symbol.trim() || threshold === '') {
      return;
    }
    await fetch('/api/v1/stock/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: symbol.trim(),
        type,
        threshold: Number(threshold),
      }),
    });
    setSymbol('');
    setThreshold('');
    void refresh();
  };
  const remove = async (id: string) => {
    await fetch(`/api/v1/stock/alerts/${id}`, { method: 'DELETE' });
    void refresh();
  };

  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 font-semibold">警報設定</h2>
      <p className="mb-3 text-xs text-gray-500">條件成立時（分析當下）自動推播給你綁定的 LINE。</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className="w-28 rounded border px-2 py-2 text-sm"
          placeholder="代號 2330"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        />
        <select
          className="rounded border px-2 py-2 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          className="w-24 rounded border px-2 py-2 text-sm"
          placeholder="門檻"
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
        />
        <button className="rounded bg-green-600 px-4 py-2 text-sm text-white" onClick={add}>
          新增
        </button>
      </div>
      <ul className="space-y-1 text-sm">
        {alerts.map((a) => (
          <li key={a.id} className="flex items-center justify-between rounded border px-3 py-2">
            <span>
              {a.symbol}　{TYPE_LABEL[a.type] ?? a.type} {a.threshold}
              {a.lastTriggeredAt ? (
                <span className="ml-2 text-xs text-orange-500">已觸發</span>
              ) : null}
            </span>
            <button className="text-red-600" onClick={() => remove(a.id)}>
              刪除
            </button>
          </li>
        ))}
        {alerts.length === 0 && (
          <li className="rounded border px-3 py-2 text-gray-400">尚無警報</li>
        )}
      </ul>
    </section>
  );
}
