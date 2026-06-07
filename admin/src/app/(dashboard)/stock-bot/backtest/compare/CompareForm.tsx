'use client';

import { useState } from 'react';
import { listStrategyMeta } from '@azeroth/common';
import { DynamicParamField, inputCls } from '../BacktestForm';

export interface CompareEntryValue {
  strategyId: string;
  params: Record<string, number>;
}

export interface CompareFormValues {
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  feeRate: number;
  taxRate: number;
  stopLossPct: number;
  takeProfitPct: number;
  entries: CompareEntryValue[];
}

const YEAR_OPTIONS = [1, 3, 5, 10] as const;
const STRATEGIES = listStrategyMeta();
const MAX_ENTRIES = 8;

function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
}

function yearsAgoStr(years: number): string {
  const d = new Date(`${todayStr()}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function initialParams(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const s of STRATEGIES) {
    out[s.id] = { ...s.defaultParams };
  }
  return out;
}

function initialSelected(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const s of STRATEGIES) {
    out[s.id] = true; // 預設全選
  }
  return out;
}

export function CompareForm({
  onRun,
  loading,
  initialSymbol,
}: {
  onRun: (values: CompareFormValues) => void;
  loading: boolean;
  initialSymbol?: string;
}) {
  const [symbol, setSymbol] = useState(initialSymbol ?? '2330');
  const [years, setYears] = useState(5);
  const [initialCapital, setInitialCapital] = useState(1_000_000);
  const [selected, setSelected] = useState(initialSelected);
  const [paramsByStrategy, setParamsByStrategy] = useState(initialParams);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [slOn, setSlOn] = useState(false);
  const [stopLossPct, setStopLossPct] = useState(8);
  const [tpOn, setTpOn] = useState(false);
  const [takeProfitPct, setTakeProfitPct] = useState(20);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [feePct, setFeePct] = useState(0.1425);
  const [taxPct, setTaxPct] = useState(0.3);

  const selectedIds = STRATEGIES.filter((s) => selected[s.id]).map((s) => s.id);
  const tooMany = selectedIds.length > MAX_ENTRIES;
  const tooFew = selectedIds.length < 2;

  const setParam = (strategyId: string, key: string, v: number) => {
    setParamsByStrategy((prev) => ({
      ...prev,
      [strategyId]: { ...prev[strategyId], [key]: v },
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = symbol.trim().match(/^\d{4,6}/)?.[0] ?? '';
    if (!sym || tooFew || tooMany) {
      return;
    }
    onRun({
      symbol: sym,
      startDate: yearsAgoStr(years),
      endDate: todayStr(),
      initialCapital,
      feeRate: feePct / 100,
      taxRate: taxPct / 100,
      stopLossPct: slOn ? stopLossPct : 0,
      takeProfitPct: tpOn ? takeProfitPct : 0,
      entries: selectedIds.map((id) => ({ strategyId: id, params: { ...paramsByStrategy[id] } })),
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">股票代號</span>
          <input
            className={inputCls}
            value={symbol}
            placeholder="例：2330"
            onChange={(e) => setSymbol(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">回測期間</span>
          <select
            className={inputCls}
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                近 {y} 年
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">本金（NT$）</span>
          <input
            type="number"
            min={10000}
            step={10000}
            className={inputCls}
            value={initialCapital}
            onChange={(e) => setInitialCapital(Number(e.target.value))}
          />
        </label>
      </div>

      {/* 策略多選清單 */}
      <div className="mt-4">
        <div className="mb-1 text-xs text-gray-500">
          選擇要比較的策略（2~{MAX_ENTRIES} 個，可展開調參數）
        </div>
        <div className="space-y-2">
          {STRATEGIES.map((s) => {
            const checked = !!selected[s.id];
            const isOpen = !!expanded[s.id];
            return (
              <div
                key={s.id}
                className="rounded border dark:border-gray-700"
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [s.id]: e.target.checked }))
                      }
                    />
                    <span className="font-medium text-gray-700 dark:text-gray-200">{s.label}</span>
                    <span className="text-xs text-gray-400">{s.description}</span>
                  </label>
                  {checked && s.paramFields.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => setExpanded((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                    >
                      {isOpen ? '▾ 收合參數' : '▸ 參數'}
                    </button>
                  )}
                </div>
                {checked && isOpen && (
                  <div className="grid grid-cols-2 gap-3 border-t px-3 py-2 md:grid-cols-4 dark:border-gray-700">
                    {s.paramFields.map((f) => (
                      <DynamicParamField
                        key={f.key}
                        field={f}
                        value={paramsByStrategy[s.id]?.[f.key] ?? s.defaultParams[f.key] ?? 0}
                        onChange={(v) => setParam(s.id, f.key, v)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {tooFew && <p className="mt-1 text-xs text-amber-600">請至少選擇 2 個策略。</p>}
        {tooMany && (
          <p className="mt-1 text-xs text-rose-600">最多比較 {MAX_ENTRIES} 個策略，請取消部分選取。</p>
        )}
      </div>

      {/* 共用：停損 / 停利 */}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-xs text-gray-500">
            <input type="checkbox" checked={slOn} onChange={(e) => setSlOn(e.target.checked)} />
            啟用停損 −%
          </span>
          <input
            type="number"
            min={0}
            max={90}
            disabled={!slOn}
            className={inputCls}
            value={stopLossPct}
            onChange={(e) => setStopLossPct(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-xs text-gray-500">
            <input type="checkbox" checked={tpOn} onChange={(e) => setTpOn(e.target.checked)} />
            啟用停利 +%
          </span>
          <input
            type="number"
            min={0}
            disabled={!tpOn}
            className={inputCls}
            value={takeProfitPct}
            onChange={(e) => setTakeProfitPct(Number(e.target.value))}
          />
        </label>
      </div>

      <button
        type="button"
        className="mt-3 text-xs text-blue-600 hover:underline"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? '▾ 收合進階設定' : '▸ 進階設定（手續費 / 證交稅）'}
      </button>
      {showAdvanced && (
        <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">手續費率 %（單邊）</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.0001}
              className={inputCls}
              value={feePct}
              onChange={(e) => setFeePct(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">證交稅率 %（賣出）</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              className={inputCls}
              value={taxPct}
              onChange={(e) => setTaxPct(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || tooFew || tooMany}
        className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? '比較中…' : '開始比較'}
      </button>
    </form>
  );
}
