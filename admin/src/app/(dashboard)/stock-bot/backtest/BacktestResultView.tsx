'use client';

import { STOCK_DISCLAIMER, getStrategyMeta } from '@azeroth/common';
import { TermLabel } from '@/components/stock/term-label';
import { BacktestVerdictCard } from './BacktestVerdictCard';
import { EquityCurveChart, type EquityPoint } from './EquityCurveChart';

export interface BacktestTradeRow {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  shares: number;
  netPnl: number;
  netPnlPct: number;
  holdingDays: number;
  exitReason: 'signal' | 'stop_loss' | 'take_profit' | 'end';
}

export interface BacktestStatsData {
  winTrades: number;
  lossTrades: number;
  avgWin: number;
  avgLoss: number;
  maxLoss: number;
  volatilityPct: number;
  sharpe: number | null;
  avgHoldingDays: number;
  /** 實際納入計算的交易日數（已扣 KD 暖身期） */
  tradingDays: number;
}

export interface BacktestResultData {
  id: string;
  symbol: string;
  name: string | null;
  status: string;
  error: string | null;
  /** 策略 id（kd / ma / macd / rsi / bollinger） */
  strategy?: string;
  startDate: string;
  endDate: string;
  initialCapital: number | null;
  finalCapital: number | null;
  totalReturnPct: number | null;
  annualizedPct: number | null;
  winRate: number | null;
  totalTrades: number | null;
  maxDrawdownPct: number | null;
  profitFactor: number | null;
  buyHoldPct: number | null;
  /** 本次實際使用的回測參數（扁平：共用 + 策略專屬） */
  params: Record<string, number> | null;
  stats: BacktestStatsData | null;
  equityCurve: EquityPoint[] | null;
  trades: BacktestTradeRow[] | null;
}

const EXIT_LABEL: Record<BacktestTradeRow['exitReason'], string> = {
  signal: '策略訊號',
  stop_loss: '停損',
  take_profit: '停利',
  end: '期末平倉',
};

export function money(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) {
    return '—';
  }
  return `NT$${Math.round(v).toLocaleString('en-US')}`;
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) {
    return '—';
  }
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

export function gainCls(v: number | null | undefined): string {
  if (v == null) {
    return 'text-gray-500';
  }
  return v >= 0 ? 'text-rose-600' : 'text-emerald-600';
}

export function dateOnly(d: string): string {
  return d.slice(0, 10);
}

/** 策略中文名稱（找不到時回傳 id）。 */
function strategyLabel(id: string | undefined): string {
  if (!id) {
    return '策略';
  }
  return getStrategyMeta(id)?.label ?? id;
}

/** 將扁平策略參數整理成「中文標籤：值」字串（依該策略 paramFields）。 */
function strategyParamText(strategyId: string | undefined, params: Record<string, number> | null): string {
  if (!strategyId || !params) {
    return '';
  }
  const meta = getStrategyMeta(strategyId);
  if (!meta) {
    return '';
  }
  return meta.paramFields
    .map((f) => `${f.label} ${params[f.key] ?? meta.defaultParams[f.key]}`)
    .join('、');
}

export function StatCard({
  termKey,
  label,
  value,
  valueCls,
}: {
  termKey?: React.ComponentProps<typeof TermLabel>['termKey'];
  label?: string;
  value: string;
  valueCls?: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="text-xs text-gray-500">
        {termKey ? <TermLabel termKey={termKey} text={label} /> : label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${valueCls ?? ''}`}>{value}</div>
    </div>
  );
}

export function BacktestResultView({ data }: { data: BacktestResultData }) {
  if (data.status === 'failed') {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        回測失敗：{data.error ?? '未知錯誤'}
      </div>
    );
  }
  if (data.status !== 'done') {
    return (
      <div className="rounded-lg border bg-white p-4 text-sm text-gray-600 dark:bg-gray-900">
        回測進行中…（{data.status}）狀態會自動更新。
      </div>
    );
  }

  const profit = (data.finalCapital ?? 0) - (data.initialCapital ?? 0);
  const beatBuyHold =
    data.totalReturnPct != null &&
    data.buyHoldPct != null &&
    data.totalReturnPct >= data.buyHoldPct;

  return (
    <div className="space-y-4">
      {/* 看圖小幫手：紅綠燈白話結論（KD 策略限定，其餘策略以摘要卡呈現） */}
      {data.strategy === 'kd' && <BacktestVerdictCard data={data} />}

      {/* 結論卡 */}
      <div className="rounded-xl border bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
            {strategyLabel(data.strategy)}
          </span>
          <span>
            {data.symbol} {data.name ?? ''}　{dateOnly(data.startDate)} ~ {dateOnly(data.endDate)}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-gray-600">本金 {money(data.initialCapital)} →</span>
          <span className={`text-2xl font-bold ${gainCls(profit)}`}>{money(data.finalCapital)}</span>
          <span className={`text-lg font-semibold ${gainCls(profit)}`}>
            {profit >= 0 ? '賺' : '賠'} {money(Math.abs(profit))}（{pct(data.totalReturnPct)}）
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
          <span>
            <TermLabel termKey="WIN_RATE" text="勝率" />：
            <b>{data.winRate != null ? `${data.winRate.toFixed(0)}%` : '—'}</b>（
            {data.stats?.winTrades ?? 0} 勝 / {data.stats?.lossTrades ?? 0} 敗，共{' '}
            {data.totalTrades ?? 0} 筆）
          </span>
          <span>
            <TermLabel termKey="ANNUALIZED_RETURN" text="年化報酬" />：
            <b className={gainCls(data.annualizedPct)}>{pct(data.annualizedPct)}</b>
          </span>
          <span>
            <TermLabel termKey="BUY_HOLD" text="買進持有對照" />：
            <b className={gainCls(data.buyHoldPct)}>{pct(data.buyHoldPct)}</b>{' '}
            <span className={beatBuyHold ? 'text-rose-600' : 'text-emerald-600'}>
              （策略{beatBuyHold ? '勝出' : '不及'}）
            </span>
          </span>
        </div>
      </div>

      {/* 零交易提示：避免「一片 0」被誤會成壞掉 */}
      {(data.totalTrades ?? 0) === 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          此區間／此參數下，{strategyLabel(data.strategy)}
          <b>未觸發任何交易</b>。可試著：放寬策略參數、拉長回測期間，或確認本金足以買進至少 1 股。
        </div>
      )}

      {/* 風險卡 */}
      <div>
        <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">風險指標</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard
            termKey="MAX_DRAWDOWN"
            label="最大回撤"
            value={pct(data.maxDrawdownPct != null ? -data.maxDrawdownPct : null)}
            valueCls="text-emerald-600"
          />
          <StatCard
            termKey="PROFIT_FACTOR"
            label="獲利因子"
            value={data.profitFactor != null ? data.profitFactor.toFixed(2) : '∞'}
          />
          <StatCard
            termKey="SHARPE"
            label="夏普值"
            value={data.stats?.sharpe != null ? data.stats.sharpe.toFixed(2) : '—'}
          />
          <StatCard
            termKey="VOLATILITY"
            label="年化波動度"
            value={pct(data.stats?.volatilityPct, 1)}
          />
          <StatCard
            label="平均持有天數"
            value={data.stats ? `${data.stats.avgHoldingDays.toFixed(0)} 天` : '—'}
          />
          <StatCard
            label="單筆最大虧損"
            value={money(data.stats?.maxLoss)}
            valueCls={gainCls(data.stats?.maxLoss)}
          />
        </div>
      </div>

      {/* 權益曲線 */}
      {data.equityCurve && data.equityCurve.length > 0 && (
        <div className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            資產變化（策略 vs 買進持有）
          </div>
          <EquityCurveChart points={data.equityCurve} trades={data.trades ?? []} />
        </div>
      )}

      {/* 交易明細 */}
      <div className="rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">
          交易明細（{data.trades?.length ?? 0} 筆）
        </div>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 dark:bg-gray-800">
              <tr>
                <th className="px-3 py-2 text-left">進場日</th>
                <th className="px-3 py-2">進場價</th>
                <th className="px-3 py-2 text-left">出場日</th>
                <th className="px-3 py-2">出場價</th>
                <th className="px-3 py-2">股數</th>
                <th className="px-3 py-2">淨損益</th>
                <th className="px-3 py-2">報酬%</th>
                <th className="px-3 py-2">持有天</th>
                <th className="px-3 py-2 text-left">出場原因</th>
              </tr>
            </thead>
            <tbody>
              {(data.trades ?? []).map((t, i) => (
                <tr key={`${t.entryDate}-${i}`} className="border-t dark:border-gray-700">
                  <td className="px-3 py-1.5 text-left">{dateOnly(t.entryDate)}</td>
                  <td className="px-3 py-1.5">{t.entryPrice.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-left">{dateOnly(t.exitDate)}</td>
                  <td className="px-3 py-1.5">{t.exitPrice.toFixed(2)}</td>
                  <td className="px-3 py-1.5">{t.shares.toLocaleString('en-US')}</td>
                  <td className={`px-3 py-1.5 ${gainCls(t.netPnl)}`}>{money(t.netPnl)}</td>
                  <td className={`px-3 py-1.5 ${gainCls(t.netPnlPct)}`}>{pct(t.netPnlPct)}</td>
                  <td className="px-3 py-1.5">{t.holdingDays}</td>
                  <td className="px-3 py-1.5 text-left text-gray-500">{EXIT_LABEL[t.exitReason]}</td>
                </tr>
              ))}
              {(data.trades ?? []).length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-gray-400">
                    此區間策略未觸發任何交易。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 資料來源與計算方式（透明化：怎麼算、數據哪來） */}
      <div className="rounded-lg border bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-2 font-medium text-gray-700 dark:text-gray-200">資料來源與計算方式</div>
        <dl className="space-y-2 text-gray-600 dark:text-gray-300">
          <div>
            <dt className="font-medium text-gray-700 dark:text-gray-200">📊 資料來源</dt>
            <dd className="mt-0.5 leading-relaxed">
              FinMind <code>TaiwanStockPrice</code>（台股每日開高低收量，原始未還原股利）。 區間{' '}
              <b>
                {dateOnly(data.startDate)} ~ {dateOnly(data.endDate)}
              </b>
              ，實際納入 <b>{data.stats?.tradingDays ?? '—'}</b> 個交易日（已扣除 KD 暖身期）。
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-700 dark:text-gray-200">⚙️ 策略與成交假設</dt>
            <dd className="mt-0.5 leading-relaxed">
              <b>{strategyLabel(data.strategy)}</b>
              {strategyParamText(data.strategy, data.params)
                ? `（${strategyParamText(data.strategy, data.params)}）`
                : ''}
              依其規則進出場
              {data.params?.stopLossPct ? `；停損 −${data.params.stopLossPct}%` : ''}
              {data.params?.takeProfitPct ? `；停利 +${data.params.takeProfitPct}%` : ''}。 訊號於<b>當日收盤</b>
              確認、<b>隔日開盤價</b>成交（避免未來函數），停損／停利於觸價當日盤中成交。 以本金可買的
              <b>最大股數（零股、全額投入）</b>買進、全進全出、複利滾入。 成本：手續費{' '}
              {((data.params?.feeRate ?? 0.001425) * 100).toFixed(4)}%（買賣各一次）+ 證交稅{' '}
              {((data.params?.taxRate ?? 0.003) * 100).toFixed(2)}%（賣出）。
              <span className="text-gray-400">　未計入滑價、漲跌停、停牌與股利還原。</span>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-700 dark:text-gray-200">🧮 指標公式</dt>
            <dd className="mt-0.5 leading-relaxed">
              勝率＝賺錢筆數 ÷ 總筆數；獲利因子＝Σ獲利 ÷ Σ虧損；
              最大回撤＝權益自波段高點的最大跌幅； 年化報酬＝(期末 ÷ 期初)^(1 ÷ 年數) −
              1（CAGR）；夏普值＝年化報酬 ÷ 年化波動度（無風險利率以 0 計）； 買進持有＝期初全額買進、期末賣出的報酬。
            </dd>
          </div>
        </dl>
      </div>

      <p className="text-xs leading-relaxed text-gray-400">
        ※ 結果為歷史模擬，過去績效不代表未來。
        <br />
        {STOCK_DISCLAIMER}
      </p>
    </div>
  );
}
