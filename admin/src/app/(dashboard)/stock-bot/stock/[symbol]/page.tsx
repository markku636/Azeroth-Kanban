'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { routes } from '@/config/routes';
import { DataSourceKey } from '@/config/data-sources';
import { DataSourceTag } from '@/components/stock/data-source-tag';
import { TermLabel } from '@/components/stock/term-label';
import { BeginnerGuide } from '@/components/stock/beginner-guide';
import { PlainVerdict } from '@/components/stock/plain-verdict';
import type { GlossaryKey } from '@/config/financial-glossary';
import {
  scoreVerdict,
  perVerdict,
  yieldVerdict,
  revenueYoyVerdict,
  actionVerdict,
  adxVerdict,
  williamsVerdict,
  biasVerdict,
  institutionalStreakVerdict,
  type Verdict,
} from '@/lib/beginner-verdict';
import { KlineChart, type KlinePoint, type Period } from '../../console/KlineChart';
import { StockVerdictCard } from '../../console/StockVerdictCard';
import { ValuationRiverChart } from './ValuationRiverChart';
import { StrategyAnalysisPanel } from './StrategyAnalysisPanel';
import { listStrategies, type ScoringStrategyId, type StockIndicators } from '@azeroth/common';

interface ApiResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}
interface ChipSummary {
  marginBalance: number;
  marginChange5: number;
  shortBalance: number;
  foreignRatio: number | null;
  foreignRatioChange5: number | null;
  date: string;
}
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
interface SignalRow {
  id: string;
  action: string;
  confidence: number;
  rationale: string | null;
  createdAt: string;
}
interface ReportRow {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
}
interface NewsRow {
  date: string;
  title: string;
  link: string;
  source: string;
}

type TabKey = 'tech' | 'strategy' | 'chips' | 'fundamental' | 'signals' | 'reports' | 'news';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'tech', label: '技術' },
  { key: 'strategy', label: '策略' },
  { key: 'chips', label: '籌碼' },
  { key: 'fundamental', label: '基本面' },
  { key: 'signals', label: '訊號' },
  { key: 'reports', label: '報告' },
  { key: 'news', label: '新聞' },
];

/** 各分頁對應的「新手導覽」名詞，切換分頁時顯示該頁相關名詞解釋。 */
const TAB_GUIDE_KEYS: Record<TabKey, GlossaryKey[]> = {
  tech: [
    'CANDLE_COLOR',
    'MA',
    'MA_BULLISH',
    'KD',
    'KD_CROSS',
    'VOLUME',
    'DMI_ADX',
    'WILLIAMS_R',
    'CCI',
    'OBV',
    'BIAS',
    'SAR',
    'DIVERGENCE',
  ],
  strategy: ['KD', 'KD_CROSS', 'MA', 'MA_PERIOD', 'MACD', 'RSI', 'BOLLINGER'],
  chips: [
    'MARGIN_BALANCE',
    'SHORT_BALANCE',
    'FOREIGN_HOLDING',
    'INSTITUTIONS',
    'INST_STREAK',
    'CHIP_CONCENTRATION',
  ],
  fundamental: [
    'REVENUE_YOY',
    'REVENUE_MOM',
    'EPS',
    'PER',
    'DIVIDEND_YIELD',
    'HEALTH_SCORE',
    'PER_RIVER',
    'PBR_RIVER',
    'VALUATION_ZONE',
  ],
  signals: ['ACTION', 'CONFIDENCE'],
  reports: [],
  news: [],
};

async function apiGet<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  const json = (await res.json()) as ApiResult<T>;
  return json.success ? (json.data ?? null) : null;
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
function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) {
    return '—';
  }
  return v.toFixed(digits);
}

export default function StockDetailPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = params.symbol;

  const [name, setName] = useState<string | null>(null);
  const [kline, setKline] = useState<KlinePoint[]>([]);
  const [period, setPeriod] = useState<Period>('day');
  const [chip, setChip] = useState<ChipSummary | null>(null);
  const [fundamental, setFundamental] = useState<Fundamental | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [scoreDate, setScoreDate] = useState<string | null>(null);
  const [scoreFactors, setScoreFactors] = useState<ScoreFactor[]>([]);
  const [indicators, setIndicators] = useState<StockIndicators | null>(null);
  const [instStreak, setInstStreak] = useState<number | null>(null);
  const [strategy, setStrategy] = useState<ScoringStrategyId>('balanced');
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [news, setNews] = useState<NewsRow[]>([]);
  const [tab, setTab] = useState<TabKey>('tech');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [k, c, s, r, n] = await Promise.all([
      apiGet<{ name: string | null; points: KlinePoint[] }>(
        `/api/v1/stock/kline?symbol=${encodeURIComponent(symbol)}`,
      ),
      apiGet<{ summary: ChipSummary }>(`/api/v1/stock/chips?symbol=${encodeURIComponent(symbol)}`),
      apiGet<SignalRow[]>(`/api/v1/stock/signals?symbol=${encodeURIComponent(symbol)}`),
      apiGet<ReportRow[]>(`/api/v1/stock/reports?symbol=${encodeURIComponent(symbol)}`),
      apiGet<NewsRow[]>(`/api/v1/stock/news?symbol=${encodeURIComponent(symbol)}`),
    ]);
    setName(k?.name ?? null);
    setKline(k?.points ?? []);
    setChip(c?.summary ?? null);
    setSignals(s ?? []);
    setReports(r ?? []);
    setNews(n ?? []);
    setLoading(false);
  }, [symbol]);

  // 基本面 + 評分另行載入：切換評分策略時只重抓此項，依所選策略 read-time 重新加權。
  const loadFundamental = useCallback(async () => {
    const f = await apiGet<{
      fundamental: Fundamental | null;
      score: number | null;
      strategyId: string | null;
      factors: ScoreFactor[] | null;
      scoreDetail: { factors: ScoreFactor[] } | null;
      scoreDate: string | null;
      indicators: StockIndicators | null;
      institutionalStreak: number | null;
    }>(`/api/v1/stock/fundamental?symbol=${encodeURIComponent(symbol)}&strategy=${strategy}`);
    setFundamental(f?.fundamental ?? null);
    setScore(f?.score ?? null);
    setScoreDate(f?.scoreDate ?? null);
    setScoreFactors(f?.factors ?? f?.scoreDetail?.factors ?? []);
    setIndicators(f?.indicators ?? null);
    setInstStreak(f?.institutionalStreak ?? null);
  }, [symbol, strategy]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadFundamental();
  }, [loadFundamental]);

  // 報價 header：由 K 線末兩點算收盤 + 漲跌%
  const quote = useMemo(() => {
    if (kline.length === 0) {
      return null;
    }
    const last = kline[kline.length - 1];
    const prev = kline[kline.length - 2];
    const changePct =
      prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null;
    return { close: last.close, date: last.date, changePct };
  }, [kline]);

  // 報告區塊日期：取最新一筆 createdAt 的 YYYY-MM-DD（前 10 碼）
  const reportDate = useMemo(() => {
    if (reports.length === 0) {
      return null;
    }
    const latest = reports.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
    return latest.createdAt.slice(0, 10);
  }, [reports]);

  return (
    <div className="space-y-5 p-6">
      {/* 報價 header */}
      <header className="flex flex-wrap items-end gap-x-6 gap-y-2 rounded-lg border p-4">
        <div>
          <h1 className="text-2xl font-bold">
            {symbol}
            {name && <span className="ml-2 text-xl font-normal text-gray-600">{name}</span>}
          </h1>
          <p className="text-xs text-gray-400">
            資料來源：FinMind{quote?.date ? ` ｜ 資料截至 ${quote.date}` : ''}
            ・內容僅供參考，非投資建議
          </p>
        </div>
        <div className="flex items-baseline gap-3">
          <span className={`text-3xl font-bold ${changeClass(quote?.changePct)}`}>
            {quote ? quote.close.toLocaleString() : '—'}
          </span>
          <span className={`text-lg font-medium ${changeClass(quote?.changePct)}`}>
            {fmtPct(quote?.changePct)}
          </span>
        </div>
        {score !== null && (
          <div className="ml-auto rounded-lg bg-gray-50 px-4 py-2 text-center dark:bg-gray-800">
            <div className="text-xs text-gray-500">
              <TermLabel termKey="HEALTH_SCORE" />
            </div>
            <div className="text-2xl font-bold">
              {score}
              <span className="text-sm font-normal text-gray-400"> / 100</span>
            </div>
            <PlainVerdict tone={scoreVerdict(score).tone} className="mt-1">
              {scoreVerdict(score).text}
            </PlainVerdict>
          </div>
        )}
      </header>

      {/* 跨功能入口：用此代號回測 / 比較策略 */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`${routes.stockBot.backtest}?symbol=${encodeURIComponent(symbol)}`}
          className="rounded border border-blue-300 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-950/30"
        >
          📈 回測這檔
        </Link>
        <Link
          href={`${routes.stockBot.backtestCompare}?symbol=${encodeURIComponent(symbol)}`}
          className="rounded border border-blue-300 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-950/30"
        >
          🔀 比較策略
        </Link>
      </div>

      {/* 分頁 */}
      <nav className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              tab === t.key
                ? 'border-blue-600 font-semibold text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {TAB_GUIDE_KEYS[tab].length > 0 && <BeginnerGuide keys={TAB_GUIDE_KEYS[tab]} />}

      {loading && <p className="text-sm text-gray-400">載入中…</p>}

      {/* 技術 */}
      {tab === 'tech' && (
        <section className="rounded-lg border p-4">
          <StockVerdictCard points={kline} symbol={symbol} name={name} />
          <div className="mb-2 inline-flex overflow-hidden rounded border text-sm">
            {(['day', 'week', 'month'] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                className={`px-3 py-1 ${period === p ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800'}`}
                onClick={() => setPeriod(p)}
              >
                {p === 'day' ? '日' : p === 'week' ? '週' : '月'}
              </button>
            ))}
          </div>
          <KlineChart points={kline} period={period} />
          {indicators && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold">趨勢動能</h3>
              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Stat
                  label={<TermLabel termKey="DMI_ADX" />}
                  value={indicators.dmi?.adx != null ? `ADX ${indicators.dmi.adx}` : '—'}
                  verdict={adxVerdict(
                    indicators.dmi?.adx,
                    indicators.dmi?.plusDi,
                    indicators.dmi?.minusDi,
                  )}
                />
                <Stat
                  label={<TermLabel termKey="WILLIAMS_R" />}
                  value={indicators.williamsR != null ? `${indicators.williamsR}` : '—'}
                  verdict={williamsVerdict(indicators.williamsR)}
                />
                <Stat
                  label={<TermLabel termKey="CCI" />}
                  value={indicators.cci != null ? `${indicators.cci}` : '—'}
                />
                <Stat
                  label={<TermLabel termKey="BIAS" />}
                  value={indicators.bias?.bias20 != null ? `${indicators.bias.bias20}%` : '—'}
                  verdict={biasVerdict(indicators.bias?.bias20)}
                />
                <Stat
                  label={<TermLabel termKey="OBV" />}
                  value={
                    indicators.obv?.trend === 'up'
                      ? '量能上升'
                      : indicators.obv?.trend === 'down'
                        ? '量能下降'
                        : indicators.obv?.trend === 'flat'
                          ? '量能持平'
                          : '—'
                  }
                />
                <Stat
                  label={<TermLabel termKey="SAR" />}
                  value={indicators.sar?.value != null ? `${indicators.sar.value}` : '—'}
                  sub={
                    indicators.sar?.position === 'long'
                      ? '價在 SAR 之上（偏多）'
                      : indicators.sar?.position === 'short'
                        ? '價跌破 SAR（偏空）'
                        : undefined
                  }
                />
              </div>
              {(indicators.divergence?.macdBearish ||
                indicators.divergence?.rsiBearish ||
                indicators.divergence?.volumeBearish) && (
                <p className="mt-2 text-xs text-green-600">
                  ⚠️ 偵測到頂背離（漲勢動能轉弱，留意拉回）
                </p>
              )}
              {(indicators.divergence?.macdBullish ||
                indicators.divergence?.rsiBullish ||
                indicators.divergence?.volumeBullish) && (
                <p className="mt-2 text-xs text-red-600">偵測到底背離（跌勢動能轉弱，可能止跌反彈）</p>
              )}
              <DataSourceTag source={DataSourceKey.SYSTEM_SCORE} date={scoreDate} />
            </div>
          )}
        </section>
      )}

      {/* 策略 */}
      {tab === 'strategy' && (
        <section className="rounded-lg border p-4">
          <StrategyAnalysisPanel symbol={symbol} />
        </section>
      )}

      {/* 籌碼 */}
      {tab === 'chips' && (
        <section className="rounded-lg border p-4 text-sm">
          {chip ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Stat
                  label={
                    <>
                      <TermLabel termKey="MARGIN_BALANCE" />（{chip.date}）
                    </>
                  }
                  value={`${chip.marginBalance.toLocaleString()} 張`}
                  sub={`近5日 ${chip.marginChange5}`}
                  subClass={changeClass(-chip.marginChange5)}
                />
                <Stat
                  label={<TermLabel termKey="SHORT_BALANCE" />}
                  value={`${chip.shortBalance.toLocaleString()} 張`}
                />
                <Stat
                  label={<TermLabel termKey="FOREIGN_HOLDING" />}
                  value={chip.foreignRatio !== null ? `${chip.foreignRatio}%` : '—'}
                  sub={
                    chip.foreignRatioChange5 !== null
                      ? `近5日 ${chip.foreignRatioChange5}pp`
                      : undefined
                  }
                  subClass={changeClass(chip.foreignRatioChange5)}
                />
                <Stat
                  label={<TermLabel termKey="INST_STREAK" />}
                  value={
                    instStreak != null && instStreak !== 0
                      ? instStreak > 0
                        ? `連買 ${instStreak} 日`
                        : `連賣 ${-instStreak} 日`
                      : '—'
                  }
                  verdict={institutionalStreakVerdict(instStreak)}
                />
              </div>
              <DataSourceTag source={DataSourceKey.FINMIND} date={chip.date} />
            </>
          ) : (
            <p className="text-gray-400">尚無籌碼資料</p>
          )}
        </section>
      )}

      {/* 基本面 */}
      {tab === 'fundamental' && (
        <section className="space-y-4">
          <div className="rounded-lg border p-4 text-sm">
            {fundamental ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Stat
                    label={
                      <>
                        <TermLabel termKey="REVENUE_YOY" text="月營收 YoY" />（
                        {fundamental.revenuePeriod ?? '—'}）
                      </>
                    }
                    value={fmtPct(fundamental.revenueYoy)}
                    valueClass={changeClass(fundamental.revenueYoy)}
                    verdict={
                      fundamental.revenueYoy != null
                        ? revenueYoyVerdict(fundamental.revenueYoy)
                        : undefined
                    }
                  />
                  <Stat
                    label={<TermLabel termKey="REVENUE_MOM" text="月營收 MoM" />}
                    value={fmtPct(fundamental.revenueMom)}
                    valueClass={changeClass(fundamental.revenueMom)}
                  />
                  <Stat label={<TermLabel termKey="EPS" />} value={fmtNum(fundamental.eps)} />
                  <Stat
                    label={<TermLabel termKey="PER" />}
                    value={fmtNum(fundamental.per)}
                    verdict={fundamental.per != null ? perVerdict(fundamental.per) : undefined}
                  />
                  <Stat
                    label={<TermLabel termKey="DIVIDEND_YIELD" />}
                    value={
                      fundamental.dividendYield !== null ? `${fundamental.dividendYield}%` : '—'
                    }
                    verdict={
                      fundamental.dividendYield != null
                        ? yieldVerdict(fundamental.dividendYield)
                        : undefined
                    }
                  />
                </div>
                <DataSourceTag
                  source={DataSourceKey.FINMIND}
                  date={fundamental.revenuePeriod}
                  dateLabel="資料月份"
                />
              </>
            ) : (
              <p className="text-gray-400">尚無基本面資料</p>
            )}
          </div>
          <ValuationRiverChart symbol={symbol} />
          {scoreFactors.length > 0 && (
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">健診評分因子</h3>
                <label className="flex items-center gap-1 text-xs text-gray-500">
                  評分策略
                  <select
                    className="rounded border px-2 py-1 text-xs"
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value as ScoringStrategyId)}
                  >
                    {listStrategies().map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <ul className="space-y-1 text-sm">
                {scoreFactors.map((fct) => (
                  <li key={fct.name} className="flex flex-wrap items-center gap-2 border-b py-1">
                    <span className="w-20 font-medium">{fct.name}</span>
                    <span className="w-12">{fct.score}</span>
                    <span className="text-xs text-gray-400">
                      （{Math.round(fct.weight * 100)}%）
                    </span>
                    <span className="text-gray-500">{fct.reason}</span>
                  </li>
                ))}
              </ul>
              <DataSourceTag source={DataSourceKey.SYSTEM_SCORE} date={scoreDate} />
            </div>
          )}
        </section>
      )}

      {/* 訊號 */}
      {tab === 'signals' && (
        <section className="rounded-lg border p-4">
          <ul className="space-y-2 text-sm">
            {signals.map((s) => (
              <li key={s.id} className="border-b pb-2">
                <span className="font-semibold">{s.action}</span>
                <PlainVerdict tone={actionVerdict(s.action).tone} className="ml-2">
                  {actionVerdict(s.action).text}
                </PlainVerdict>
                <span className="ml-2 text-gray-500">
                  <TermLabel termKey="CONFIDENCE" text="信心" /> {s.confidence}
                </span>
                <span className="ml-2 text-xs text-gray-400">
                  {new Date(s.createdAt).toLocaleString('zh-TW')}
                </span>
                {s.rationale && <p className="text-gray-600">{s.rationale}</p>}
              </li>
            ))}
            {signals.length === 0 && <li className="text-gray-400">尚無訊號</li>}
          </ul>
          <DataSourceTag source={DataSourceKey.SYSTEM_SCORE} />
        </section>
      )}

      {/* 報告 */}
      {tab === 'reports' && (
        <section className="rounded-lg border p-4">
          <ul className="space-y-3 text-sm">
            {reports.map((r) => (
              <li key={r.id} className="border-b pb-3">
                <p className="font-semibold">{r.title}</p>
                <p className="whitespace-pre-wrap text-gray-600">{r.summary}</p>
              </li>
            ))}
            {reports.length === 0 && <li className="text-gray-400">尚無研究報告</li>}
          </ul>
          <DataSourceTag source={DataSourceKey.AI_CLAUDE} date={reportDate} />
        </section>
      )}

      {/* 新聞 */}
      {tab === 'news' && (
        <section className="rounded-lg border p-4">
          <ul className="space-y-2 text-sm">
            {news.map((nws, i) => (
              <li key={`${nws.date}-${i}`} className="border-b pb-2">
                <a
                  href={nws.link}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-blue-600 hover:underline"
                >
                  {nws.title}
                </a>
                <span className="ml-2 text-xs text-gray-400">
                  {nws.source}・{nws.date}
                </span>
              </li>
            ))}
            {news.length === 0 && <li className="text-gray-400">近 7 日無新聞</li>}
          </ul>
          <DataSourceTag source={DataSourceKey.FINMIND} />
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
  sub,
  subClass,
  verdict,
}: {
  label: ReactNode;
  value: string;
  valueClass?: string;
  sub?: string;
  subClass?: string;
  verdict?: Verdict;
}) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${valueClass ?? ''}`}>{value}</div>
      {verdict && (
        <PlainVerdict tone={verdict.tone} className="mt-1">
          {verdict.text}
        </PlainVerdict>
      )}
      {sub && <div className={`text-xs ${subClass ?? 'text-gray-400'}`}>{sub}</div>}
    </div>
  );
}
