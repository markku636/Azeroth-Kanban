'use client';

import { useMemo, useState } from 'react';
import { listStrategyMeta, type ParamField } from '@azeroth/common';
import { TermLabel } from '@/components/stock/term-label';
import type { GlossaryKey } from '@/config/financial-glossary';

export interface BacktestFormValues {
  symbol: string;
  startDate: string;
  endDate: string;
  strategy: string;
  /** 策略專屬參數 */
  params: Record<string, number>;
  // 共用參數
  initialCapital: number;
  feeRate: number;
  taxRate: number;
  stopLossPct: number;
  takeProfitPct: number;
}

const YEAR_OPTIONS = [1, 3, 5, 10] as const;
const STRATEGIES = listStrategyMeta();

/** 台北今日 YYYY-MM-DD。 */
function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
}

/** N 年前 YYYY-MM-DD。 */
function yearsAgoStr(years: number): string {
  const d = new Date(`${todayStr()}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export const inputCls =
  'w-full rounded border px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800';

/** 依 ParamField 描述渲染一個數字輸入欄（含名詞浮窗）。 */
export function DynamicParamField({
  field,
  value,
  onChange,
}: {
  field: ParamField;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-gray-500">
        {field.glossaryKey ? (
          <TermLabel termKey={field.glossaryKey as GlossaryKey} text={field.label} />
        ) : (
          field.label
        )}
      </span>
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        className={inputCls}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/** 初始化各策略的預設參數（切換策略時保留各自編輯）。 */
function initialParamsByStrategy(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const s of STRATEGIES) {
    out[s.id] = { ...s.defaultParams };
  }
  return out;
}

export function BacktestForm({
  onRun,
  loading,
  initialSymbol,
}: {
  onRun: (values: BacktestFormValues) => void;
  loading: boolean;
  initialSymbol?: string;
}) {
  const [symbol, setSymbol] = useState(initialSymbol ?? '2330');
  const [years, setYears] = useState(5);
  const [strategy, setStrategy] = useState(STRATEGIES[0]?.id ?? 'kd');
  const [paramsByStrategy, setParamsByStrategy] = useState(initialParamsByStrategy);
  const [slOn, setSlOn] = useState(false);
  const [stopLossPct, setStopLossPct] = useState(8);
  const [tpOn, setTpOn] = useState(false);
  const [takeProfitPct, setTakeProfitPct] = useState(20);
  const [initialCapital, setInitialCapital] = useState(1_000_000);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [feePct, setFeePct] = useState(0.1425);
  const [taxPct, setTaxPct] = useState(0.3);

  const meta = useMemo(() => STRATEGIES.find((s) => s.id === strategy), [strategy]);
  const basicFields = meta?.paramFields.filter((f) => !f.advanced) ?? [];
  const advancedFields = meta?.paramFields.filter((f) => f.advanced) ?? [];
  const curParams = paramsByStrategy[strategy] ?? {};

  const setParam = (key: string, v: number) => {
    setParamsByStrategy((prev) => ({
      ...prev,
      [strategy]: { ...prev[strategy], [key]: v },
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = symbol.trim().match(/^\d{4,6}/)?.[0] ?? '';
    if (!sym) {
      return;
    }
    onRun({
      symbol: sym,
      startDate: yearsAgoStr(years),
      endDate: todayStr(),
      strategy,
      params: { ...curParams },
      stopLossPct: slOn ? stopLossPct : 0,
      takeProfitPct: tpOn ? takeProfitPct : 0,
      initialCapital,
      feeRate: feePct / 100,
      taxRate: taxPct / 100,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">策略</span>
          <select
            className={inputCls}
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
          >
            {STRATEGIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
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

      {meta?.description && (
        <p className="mt-2 text-xs text-gray-500">說明：{meta.description}</p>
      )}

      {/* 策略專屬參數（非進階） */}
      {basicFields.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {basicFields.map((f) => (
            <DynamicParamField
              key={f.key}
              field={f}
              value={curParams[f.key] ?? meta?.defaultParams[f.key] ?? 0}
              onChange={(v) => setParam(f.key, v)}
            />
          ))}
        </div>
      )}

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
        {showAdvanced ? '▾ 收合進階設定' : '▸ 進階設定（策略進階參數 / 手續費 / 證交稅）'}
      </button>
      {showAdvanced && (
        <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3">
          {advancedFields.map((f) => (
            <DynamicParamField
              key={f.key}
              field={f}
              value={curParams[f.key] ?? meta?.defaultParams[f.key] ?? 0}
              onChange={(v) => setParam(f.key, v)}
            />
          ))}
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
        disabled={loading}
        className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? '回測中…' : '開始回測'}
      </button>
    </form>
  );
}
