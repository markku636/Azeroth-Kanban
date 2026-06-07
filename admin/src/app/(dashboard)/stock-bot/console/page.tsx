'use client';

import Link from 'next/link';
import { routes } from '@/config/routes';
import { useCallback, useEffect, useState } from 'react';
import { DataSourceKey } from '@/config/data-sources';
import { DataSourceTag } from '@/components/stock/data-source-tag';
import { TermLabel } from '@/components/stock/term-label';
import { BeginnerGuide } from '@/components/stock/beginner-guide';
import { PlainVerdict } from '@/components/stock/plain-verdict';
import { scoreVerdict } from '@/lib/beginner-verdict';
import { KlineChart, type KlinePoint, type Period } from './KlineChart';
import { StockVerdictCard } from './StockVerdictCard';
import { AlertsPanel } from './AlertsPanel';
import { StockCombobox } from './StockCombobox';

interface ApiResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}
interface WatchItem {
  id: string;
  symbol: string;
  name: string | null;
  tags: string[];
  isActive: boolean;
  close: number | null;
  changePct: number | null;
  score: number | null;
  action: string | null;
  priceDate: string | null;
}
interface SignalRow {
  id: string;
  symbol: string;
  name: string | null;
  action: string;
  confidence: number;
  rationale: string | null;
  createdAt: string;
}
interface ReportRow {
  id: string;
  symbol: string;
  title: string;
  summary: string;
  createdAt: string;
}

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

/** 從下拉值（可能是「2330 台積電」或「00878 國泰永續高股息」）解析開頭台股代號（4–6 碼，含 ETF）。 */
function parseSymbol(value: string): string {
  const m = value.trim().match(/^\d{4,6}/);
  return m ? m[0] : value.trim();
}

export default function StockBotConsolePage() {
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [watchMsg, setWatchMsg] = useState('');
  const [stockOptions, setStockOptions] = useState<{ symbol: string; name: string }[]>([]);
  const [chat, setChat] = useState<{ role: 'user' | 'bot'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  // K 線圖
  const [chartSymbol, setChartSymbol] = useState('2330');
  const [kline, setKline] = useState<KlinePoint[]>([]);
  const [chartName, setChartName] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('day');
  const [chartMsg, setChartMsg] = useState('');

  // 籌碼摘要
  interface ChipSummary {
    marginBalance: number;
    marginChange5: number;
    shortBalance: number;
    foreignRatio: number | null;
    foreignRatioChange5: number | null;
    date: string;
  }
  const [chip, setChip] = useState<ChipSummary | null>(null);

  // 基本面 + 評分
  interface Fundamental {
    revenuePeriod: string | null;
    revenueYoy: number | null;
    revenueMom: number | null;
    eps: number | null;
    per: number | null;
    dividendYield: number | null;
  }
  interface ScoreFactor {
    name: string;
    score: number;
    weight: number;
    reason: string;
  }
  const [fundamental, setFundamental] = useState<Fundamental | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [scoreFactors, setScoreFactors] = useState<ScoreFactor[]>([]);
  const [scoreDate, setScoreDate] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setWatchlist((await apiGet<WatchItem[]>('/api/v1/stock/watchlist')) ?? []);
    setSignals((await apiGet<SignalRow[]>('/api/v1/stock/signals')) ?? []);
    setReports((await apiGet<ReportRow[]>('/api/v1/stock/reports')) ?? []);
  }, []);

  const loadChart = useCallback(async (rawSym: string) => {
    const sym = parseSymbol(rawSym);
    if (!sym) {
      return;
    }
    setChartSymbol(sym);
    setChartMsg('載入中…');
    const res = await fetch(`/api/v1/stock/kline?symbol=${encodeURIComponent(sym)}`);
    const json = (await res.json()) as ApiResult<{ name: string | null; points: KlinePoint[] }>;
    if (json.success && json.data?.points?.length) {
      setKline(json.data.points);
      setChartName(json.data.name);
      setChartMsg('');
    } else {
      setKline([]);
      setChartName(null);
      setChartMsg(json.message || '尚無資料');
    }
    // 同步載入籌碼摘要
    const cres = await fetch(`/api/v1/stock/chips?symbol=${encodeURIComponent(sym)}`);
    const cjson = (await cres.json()) as ApiResult<{ summary: ChipSummary }>;
    setChip(cjson.success && cjson.data ? cjson.data.summary : null);
    // 基本面 + 評分
    const fres = await fetch(`/api/v1/stock/fundamental?symbol=${encodeURIComponent(sym)}`);
    const fjson = (await fres.json()) as ApiResult<{
      fundamental: Fundamental | null;
      score: number | null;
      scoreDetail: { factors: ScoreFactor[] } | null;
      scoreDate: string | null;
    }>;
    if (fjson.success && fjson.data) {
      setFundamental(fjson.data.fundamental);
      setScore(fjson.data.score);
      setScoreFactors(fjson.data.scoreDetail?.factors ?? []);
      setScoreDate(fjson.data.scoreDate ?? null);
    } else {
      setFundamental(null);
      setScore(null);
      setScoreFactors([]);
      setScoreDate(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void loadChart('2330');
  }, [refresh, loadChart]);

  // 載入全市場代號清單（供下拉搜尋）
  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/v1/stock/list');
      const json = (await res.json()) as ApiResult<{ symbol: string; name: string }[]>;
      if (json.success && json.data) {
        setStockOptions(json.data);
      }
    })();
  }, []);

  const send = async () => {
    const message = input.trim();
    if (!message) {
      return;
    }
    setChat((c) => [...c, { role: 'user', text: message }]);
    setInput('');
    setBusy(true);
    const res = await apiPost<{ reply: string }>('/api/v1/stock/simulate', {
      message,
    });
    setChat((c) => [...c, { role: 'bot', text: res.data?.reply ?? res.message }]);
    setBusy(false);
    void refresh();
  };

  const addWatch = async (raw: string) => {
    const sym = parseSymbol(raw);
    if (!sym) {
      return;
    }
    await apiPost('/api/v1/stock/watchlist', { symbol: sym });
    void refresh();
  };
  const removeWatch = async (id: string) => {
    await fetch(`/api/v1/stock/watchlist/${id}`, { method: 'DELETE' });
    void refresh();
  };
  const analyze = async (s: string) => {
    setWatchMsg(`已送出 ${s} 分析，約 10 秒後自動更新…`);
    const res = await apiPost('/api/v1/stock/analyze', { symbol: s });
    if (!res.success) {
      setWatchMsg(res.message || `${s} 分析觸發失敗`);
      return;
    }
    setTimeout(() => {
      void refresh();
      setWatchMsg('');
    }, 10_000);
  };
  const research = async (s: string) => {
    setWatchMsg(`已送出 ${s} 研究（AI 撰寫中），約 45 秒後自動更新…`);
    const res = await apiPost('/api/v1/stock/reports/generate', { symbol: s });
    if (!res.success) {
      setWatchMsg(res.message || `${s} 研究觸發失敗`);
      return;
    }
    setTimeout(() => {
      void refresh();
      setWatchMsg('');
    }, 45_000);
  };

  // K 線圖「立即分析」：對當前選定代號觸發分析，補上 / 刷新其 K 線資料。
  // 解決「切換到尚未分析過的股票（如 0050）只顯示『請先分析』卻無從分析」的缺口。
  const analyzeChart = async () => {
    const sym = chartSymbol;
    setChartMsg(`已送出 ${sym} 分析，約 10 秒後自動載入…`);
    const res = await apiPost('/api/v1/stock/analyze', { symbol: sym });
    if (!res.success) {
      setChartMsg(res.message || `${sym} 分析觸發失敗`);
      return;
    }
    setTimeout(() => {
      void loadChart(sym);
    }, 10_000);
  };

  // 關注清單區塊日期：取清單中最新一筆 priceDate（皆無則為 null）。
  const watchlistLatestDate = watchlist.reduce<string | null>((latest, w) => {
    if (!w.priceDate) {
      return latest;
    }
    return latest && latest >= w.priceDate ? latest : w.priceDate;
  }, null);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">股票 AI 機器人 — 後台 Console</h1>
        <p className="text-sm text-gray-500">
          模擬對話、管理關注股、檢視 K 線 / 訊號 / 研究報告與警報。內容僅供參考，非投資建議。
        </p>
      </header>

      <BeginnerGuide
        keys={[
          'CANDLE_COLOR',
          'MA',
          'KD',
          'MARGIN_BALANCE',
          'FOREIGN_HOLDING',
          'REVENUE_YOY',
          'PER',
          'DIVIDEND_YIELD',
          'HEALTH_SCORE',
          'ACTION',
        ]}
      />

      {/* K 線圖（全寬） */}
      <section className="rounded-lg border p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-3 font-semibold">
            K 線圖
            {chartName && (
              <span className="ml-2 text-base font-normal text-gray-600">
                {chartSymbol} {chartName}
              </span>
            )}
          </h2>
          <StockCombobox
            options={stockOptions}
            initial={chartSymbol}
            onSelect={(s) => loadChart(s)}
            placeholder="搜尋代號 / 名稱"
            className="w-52"
          />
          {/* 日/週/月切換 */}
          <div className="ml-2 inline-flex overflow-hidden rounded border">
            {(['day', 'week', 'month'] as Period[]).map((p) => (
              <button
                key={p}
                className={`px-3 py-1 text-sm ${period === p ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
                onClick={() => setPeriod(p)}
              >
                {p === 'day' ? '日' : p === 'week' ? '週' : '月'}
              </button>
            ))}
          </div>
          {/* 立即分析：補上 / 刷新當前代號的 K 線（非關注股也能觸發） */}
          <button
            type="button"
            className="ml-2 rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            onClick={analyzeChart}
            title="抓取並分析此股，更新 K 線與訊號"
          >
            立即分析
          </button>
          <Link
            href={`${routes.stockBot.backtest}?symbol=${encodeURIComponent(chartSymbol)}`}
            className="ml-2 rounded border border-blue-300 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-950/30"
            title="用此代號的 K 線跑策略回測"
          >
            📈 用 K 線回測
          </Link>
          {chartMsg && <span className="text-sm text-gray-400">{chartMsg}</span>}
        </div>
        <StockVerdictCard points={kline} symbol={chartSymbol} name={chartName} />
        <KlineChart points={kline} period={period} />
        {chip && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 rounded bg-gray-50 p-3 text-sm dark:bg-gray-900">
            <span className="font-medium">籌碼（{chip.date}）</span>
            <span>
              <TermLabel termKey="MARGIN_BALANCE" text="融資餘額" />{' '}
              {chip.marginBalance.toLocaleString()} 張
              <span className={chip.marginChange5 < 0 ? 'text-red-600' : 'text-green-600'}>
                （近5日 {chip.marginChange5 > 0 ? '+' : ''}
                {chip.marginChange5.toLocaleString()}）
              </span>
            </span>
            <span>
              <TermLabel termKey="SHORT_BALANCE" text="融券餘額" />{' '}
              {chip.shortBalance.toLocaleString()} 張
            </span>
            {chip.foreignRatio != null && (
              <span>
                <TermLabel termKey="FOREIGN_HOLDING" text="外資持股" /> {chip.foreignRatio}%
                {chip.foreignRatioChange5 != null && (
                  <span
                    className={chip.foreignRatioChange5 >= 0 ? 'text-red-600' : 'text-green-600'}
                  >
                    （近5日 {chip.foreignRatioChange5 >= 0 ? '+' : ''}
                    {chip.foreignRatioChange5}pp）
                  </span>
                )}
              </span>
            )}
            <DataSourceTag source={DataSourceKey.FINMIND} date={chip.date} className="w-full" />
          </div>
        )}
        {/* 基本面 */}
        {fundamental && (
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 rounded bg-gray-50 p-3 text-sm dark:bg-gray-900">
            <span className="font-medium">基本面</span>
            {fundamental.revenueYoy != null && (
              <span>
                <TermLabel termKey="REVENUE_YOY" text="月營收 YoY" />{' '}
                <span className={fundamental.revenueYoy >= 0 ? 'text-red-600' : 'text-green-600'}>
                  {fundamental.revenueYoy >= 0 ? '+' : ''}
                  {fundamental.revenueYoy}%
                </span>
                {fundamental.revenueMom != null && `／MoM ${fundamental.revenueMom}%`}
                {fundamental.revenuePeriod ? `（${fundamental.revenuePeriod}）` : ''}
              </span>
            )}
            {fundamental.eps != null && (
              <span>
                <TermLabel termKey="EPS" /> {fundamental.eps}
              </span>
            )}
            {fundamental.per != null && (
              <span>
                <TermLabel termKey="PER" /> {fundamental.per}
              </span>
            )}
            {fundamental.dividendYield != null && (
              <span>
                <TermLabel termKey="DIVIDEND_YIELD" /> {fundamental.dividendYield}%
              </span>
            )}
            <DataSourceTag
              source={DataSourceKey.FINMIND}
              date={fundamental.revenuePeriod}
              dateLabel="資料月份"
              className="w-full"
            />
          </div>
        )}
        {/* 健診評分 */}
        {score != null && (
          <div className="mt-2 rounded border p-3 text-sm">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-medium">
                <TermLabel termKey="HEALTH_SCORE" />
              </span>
              <span
                className={`text-lg font-bold ${score >= 70 ? 'text-red-600' : score <= 40 ? 'text-green-600' : 'text-gray-700'}`}
              >
                {score}
              </span>
              <span className="text-gray-400">/ 100</span>
              <PlainVerdict tone={scoreVerdict(score).tone}>{scoreVerdict(score).text}</PlainVerdict>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-600">
              {scoreFactors.map((f) => (
                <span key={f.name}>
                  {f.name} {f.score}
                  <span className="text-xs text-gray-400">
                    （{Math.round(f.weight * 100)}%）{f.reason}
                  </span>
                </span>
              ))}
            </div>
            <DataSourceTag source={DataSourceKey.SYSTEM_SCORE} date={scoreDate} />
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 模擬對話 */}
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">模擬對話</h2>
          <div className="mb-2 h-64 space-y-2 overflow-y-auto rounded bg-gray-50 p-3 text-sm dark:bg-gray-900">
            {chat.length === 0 && (
              <p className="text-gray-400">
                試試 /watch 2330、/signal 2330、/report 2330、/gainers，或直接白話問「2330
                現在可以買嗎？」
              </p>
            )}
            {chat.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                <span
                  className={`inline-block whitespace-pre-wrap rounded px-3 py-1 ${
                    m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  {m.text}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded border px-3 py-2 text-sm"
              placeholder="輸入指令或問題…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              disabled={busy}
            />
            <button
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              onClick={send}
              disabled={busy}
            >
              {busy ? '思考中…' : '送出'}
            </button>
          </div>
        </section>

        {/* 關注清單 */}
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">關注清單</h2>
          <div className="mb-3">
            <StockCombobox
              options={stockOptions}
              onSelect={(s) => addWatch(s)}
              placeholder="搜尋代號或名稱加入關注（如 2330 / 台積電）"
            />
          </div>
          {watchMsg && <p className="mb-2 text-xs text-blue-600">{watchMsg}</p>}
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
                  <th className="py-1 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((w) => (
                  <tr key={w.id} className="border-t">
                    <td className="whitespace-nowrap py-2">
                      <button
                        className="hover:underline"
                        onClick={() => {
                          setChartSymbol(w.symbol);
                          void loadChart(w.symbol);
                        }}
                      >
                        {w.symbol}
                        {w.name ? `　${w.name}` : ''}
                      </button>
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {w.close == null
                        ? '—'
                        : w.close.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {w.changePct == null ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className={w.changePct >= 0 ? 'text-red-600' : 'text-green-600'}>
                          {w.changePct >= 0 ? '▲' : '▼'}
                          {Math.abs(w.changePct)}%
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {w.score == null ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span
                          className={
                            w.score >= 70
                              ? 'font-medium text-red-600'
                              : w.score <= 40
                                ? 'font-medium text-green-600'
                                : 'text-gray-700'
                          }
                        >
                          {w.score}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2">
                      <span className="flex justify-end gap-2">
                        <button className="text-blue-600" onClick={() => analyze(w.symbol)}>
                          分析
                        </button>
                        <button className="text-purple-600" onClick={() => research(w.symbol)}>
                          研究
                        </button>
                        <Link
                          href={`/stock-bot/stock/${w.symbol}`}
                          className="text-gray-600 hover:underline"
                        >
                          詳情
                        </Link>
                        <button className="text-red-600" onClick={() => removeWatch(w.id)}>
                          移除
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
                {watchlist.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-2 text-gray-400">
                      尚無關注股
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DataSourceTag source={DataSourceKey.FINMIND} date={watchlistLatestDate} />
        </section>

        {/* 警報 */}
        <AlertsPanel />

        {/* 最新訊號 */}
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">最新訊號</h2>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1">代號</th>
                  <th>
                    <TermLabel termKey="ACTION" text="動作" />
                  </th>
                  <th>
                    <TermLabel termKey="CONFIDENCE" text="信心" />
                  </th>
                  <th>說明</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.id} className="border-t align-top">
                    <td className="whitespace-nowrap py-1">
                      {s.symbol}
                      {s.name ? <span className="ml-1 text-gray-500">{s.name}</span> : ''}
                    </td>
                    <td
                      className={
                        s.action === 'BUY'
                          ? 'text-red-600'
                          : s.action === 'SELL'
                            ? 'text-green-600'
                            : ''
                      }
                    >
                      {s.action}
                    </td>
                    <td>{s.confidence}</td>
                    <td className="max-w-xs break-words text-gray-600">{s.rationale}</td>
                  </tr>
                ))}
                {signals.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-2 text-gray-400">
                      尚無訊號
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DataSourceTag source={DataSourceKey.SYSTEM_SCORE} />
        </section>

        {/* 研究報告 */}
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">研究報告</h2>
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {reports.map((r) => (
              <li key={r.id} className="rounded border p-2">
                <div className="break-words font-medium">{r.title}</div>
                <div className="break-words text-gray-600">{r.summary}</div>
              </li>
            ))}
            {reports.length === 0 && <li className="text-gray-400">尚無報告</li>}
          </ul>
          <DataSourceTag
            source={DataSourceKey.AI_CLAUDE}
            date={reports[0]?.createdAt?.slice(0, 10)}
          />
        </section>
      </div>
    </div>
  );
}
