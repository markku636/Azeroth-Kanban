'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketReportDto } from '@azeroth/common';

import { DataSourceKey } from '@/config/data-sources';
import { DataSourceTag } from '@/components/stock/data-source-tag';
import { TermLabel } from '@/components/stock/term-label';
import { BeginnerGuide } from '@/components/stock/beginner-guide';
import { PlainVerdict } from '@/components/stock/plain-verdict';
import type { Verdict } from '@/lib/beginner-verdict';

import GlobalBoard from './_components/global-board';

/** POST 後等待 worker 完成再重新整理的延遲。 */
const RELOAD_DELAY_MS = 10_000;

interface ApiResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}
interface SectorChange {
  name: string;
  changePct: number;
}
interface MarketData {
  date: string;
  taiex: {
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    changePct: number | null;
  };
  breadth: { advancers: number; decliners: number; unchanged: number };
  sectors: SectorChange[];
}

/** 台股慣例：漲紅跌綠。 */
function changeClass(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) {
    return 'text-gray-500';
  }
  return v > 0 ? 'text-red-600' : 'text-green-600';
}
function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) {
    return '—';
  }
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

export default function StockMarketPage() {
  const [data, setData] = useState<MarketData | null>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/v1/stock/market');
    const json = (await res.json()) as ApiResult<MarketData>;
    if (json.success && json.data) {
      setData(json.data);
      setMsg('');
    } else {
      setData(null);
      setMsg(json.message || '尚無資料');
    }
    setLoading(false);
  }, []);

  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void load();
    return () => {
      if (reloadTimer.current) {
        clearTimeout(reloadTimer.current);
      }
    };
  }, [load]);

  const update = async () => {
    setMsg('更新中…');
    const res = await fetch('/api/v1/stock/market', { method: 'POST' });
    const json = (await res.json()) as ApiResult;
    if (!json.success) {
      setMsg(json.message || '大盤更新失敗');
      return;
    }
    setMsg(`已送出更新，約 ${RELOAD_DELAY_MS / 1000} 秒後重新整理…`);
    if (reloadTimer.current) {
      clearTimeout(reloadTimer.current);
    }
    reloadTimer.current = setTimeout(() => void load(), RELOAD_DELAY_MS);
  };

  const breadth = data?.breadth;
  const total = breadth ? breadth.advancers + breadth.decliners + breadth.unchanged : 0;
  const upPct = total ? (breadth!.advancers / total) * 100 : 0;
  const downPct = total ? (breadth!.decliners / total) * 100 : 0;
  const flatPct = Math.max(0, 100 - upPct - downPct);

  const topGainers = (data?.sectors ?? []).slice(0, 8);
  const topLosers = (data?.sectors ?? []).slice(-8).reverse();

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">大盤 / 類股輪動</h1>
        {data && <span className="text-sm text-gray-500">{data.date}</span>}
        <button className="rounded bg-blue-600 px-3 py-2 text-sm text-white" onClick={() => load()}>
          重新整理
        </button>
        <button className="rounded bg-green-600 px-3 py-2 text-sm text-white" onClick={update}>
          立即更新大盤
        </button>
        {loading && <span className="text-sm text-gray-400">載入中…</span>}
      </header>
      {msg && <p className="text-sm text-gray-500">{msg}</p>}
      {data && <DataSourceTag source={DataSourceKey.TWSE} date={data.date} />}

      {/* AI 盤勢解讀：彙整大盤 + 國際盤 + 籌碼，由 Claude 產出白話報告，置於頁面最上方 */}
      <MarketAiReport />

      <BeginnerGuide
        keys={[
          'GLOBAL_INDEX',
          'TXF',
          'NIGHT_SESSION',
          'BASIS',
          'INSTITUTIONS',
          'OPEN_INTEREST',
          'LONG_SHORT_OI',
          'TAIEX',
          'BREADTH',
          'SECTOR_ROTATION',
        ]}
      />

      {/* 國際盤 / 期貨夜盤（美股四大指數 + 台指期夜盤）：影響台股開盤方向 */}
      <GlobalBoard />

      {data && (
        <>
          {/* 加權指數 + 漲跌家數 */}
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-lg border p-4">
              <h2 className="mb-2 font-semibold">
                <TermLabel termKey="TAIEX" />
              </h2>
              <div className="flex items-baseline gap-3">
                <span className={`text-3xl font-bold ${changeClass(data.taiex.changePct)}`}>
                  {data.taiex.close != null ? data.taiex.close.toLocaleString() : '—'}
                </span>
                <span className={`text-lg font-medium ${changeClass(data.taiex.changePct)}`}>
                  {fmtPct(data.taiex.changePct)}
                </span>
              </div>
              <div className="mt-2 text-sm text-gray-500">
                開 {data.taiex.open?.toLocaleString() ?? '—'}　高{' '}
                {data.taiex.high?.toLocaleString() ?? '—'}　低{' '}
                {data.taiex.low?.toLocaleString() ?? '—'}
              </div>
            </section>

            <section className="rounded-lg border p-4">
              <h2 className="mb-2 font-semibold">
                <TermLabel termKey="BREADTH" />
              </h2>
              <div className="mb-2 flex h-5 overflow-hidden rounded">
                <div className="bg-red-500" style={{ width: `${upPct}%` }} />
                <div className="bg-gray-300" style={{ width: `${flatPct}%` }} />
                <div className="bg-green-600" style={{ width: `${downPct}%` }} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-red-600">上漲 {breadth?.advancers ?? 0}</span>
                <span className="text-gray-500">平盤 {breadth?.unchanged ?? 0}</span>
                <span className="text-green-600">下跌 {breadth?.decliners ?? 0}</span>
              </div>
            </section>
          </div>

          {/* 類股強弱 */}
          <div className="grid gap-4 md:grid-cols-2">
            <SectorTable title="領漲類股" rows={topGainers} />
            <SectorTable title="領跌類股" rows={topLosers} />
          </div>

          {/* 全部類股 */}
          <section className="rounded-lg border p-4">
            <h2 className="mb-3 font-semibold">
              <TermLabel termKey="SECTOR_ROTATION" text="全部類股輪動" />
            </h2>
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {data.sectors.map((s) => (
                <div key={s.name} className="flex justify-between border-b py-1">
                  <span>{s.name}</span>
                  <span className={changeClass(s.changePct)}>{fmtPct(s.changePct)}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** sentiment → 統一白話結論（沿用全站 PlainVerdict：台股紅好綠壞 + 👍/👀/👎）。 */
const SENTIMENT_VERDICT: Record<NonNullable<MarketReportDto['sentiment']>, Verdict> = {
  bullish: { text: '偏多', tone: 'good' },
  neutral: { text: '中性', tone: 'neutral' },
  bearish: { text: '偏空', tone: 'bad' },
};

/** 大盤 AI 盤勢解讀面板：顯示最新一篇、可手動重跑（POST 後延遲重新整理）。 */
function MarketAiReport() {
  const [report, setReport] = useState<MarketReportDto | null>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/v1/stock/market/report');
    const json = (await res.json()) as ApiResult<MarketReportDto | null>;
    setReport(json.success ? (json.data ?? null) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [load]);

  const generate = async () => {
    setMsg('AI 解讀產生中…（約需數十秒，完成後自動重新整理）');
    const res = await fetch('/api/v1/stock/market/report', { method: 'POST' });
    const json = (await res.json()) as ApiResult;
    if (!json.success) {
      setMsg(json.message || '產生失敗');
      return;
    }
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      setMsg('');
      void load();
    }, 30_000);
  };

  const verdict = report?.sentiment ? SENTIMENT_VERDICT[report.sentiment] : null;

  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">AI 盤勢解讀</h2>
        {verdict && <PlainVerdict tone={verdict.tone}>{verdict.text}</PlainVerdict>}
        <button
          type="button"
          className="rounded bg-purple-600 px-3 py-1.5 text-sm text-white"
          onClick={generate}
        >
          {report ? '重新產生' : '產生 AI 解讀'}
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm"
          onClick={() => load()}
        >
          重新整理
        </button>
        {loading && <span className="text-sm text-gray-400">載入中…</span>}
      </div>
      {msg && <p className="mt-2 text-sm text-gray-500">{msg}</p>}

      {report ? (
        <div className="mt-3">
          {report.degraded && (
            <p className="mb-2 text-sm text-amber-600 dark:text-amber-400">
              ⚠️ 資料摘要版（Claude 未就緒，未經 AI 深度研判）。
            </p>
          )}
          <h3 className="font-medium">{report.title}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
            {report.summary}
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-blue-600">展開完整報告</summary>
            <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {report.body}
            </div>
          </details>
          <DataSourceTag source={DataSourceKey.AI_CLAUDE} date={report.reportDate} />
        </div>
      ) : (
        !loading && (
          <p className="mt-3 text-sm text-gray-400">
            尚無盤勢報告，按「產生 AI 解讀」讓 AI 彙整今日盤勢（需 worker 在線）。
          </p>
        )
      )}
    </section>
  );
}

function SectorTable({ title, rows }: { title: string; rows: SectorChange[] }) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      <ul className="space-y-1 text-sm">
        {rows.map((s) => (
          <li key={s.name} className="flex justify-between">
            <span>{s.name}</span>
            <span className={changeClass(s.changePct)}>{fmtPct(s.changePct)}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-gray-400">—</li>}
      </ul>
    </section>
  );
}
