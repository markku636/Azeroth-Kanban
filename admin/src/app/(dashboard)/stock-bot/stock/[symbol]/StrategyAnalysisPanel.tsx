'use client';

import { useCallback, useEffect, useState } from 'react';
import { DataSourceKey } from '@/config/data-sources';
import { DataSourceTag } from '@/components/stock/data-source-tag';
import { TermLabel } from '@/components/stock/term-label';
import { PlainVerdict } from '@/components/stock/plain-verdict';
import { actionVerdict } from '@/lib/beginner-verdict';
import type { GlossaryKey } from '@/config/financial-glossary';

type SignalAction = 'BUY' | 'SELL' | 'WAIT';

interface SignalSummary {
  action: SignalAction;
  freshToday: boolean;
  barsAgo: number | null;
  signalDate: string | null;
}
interface StatsSummary {
  totalTrades: number;
  winRate: number;
  totalReturnPct: number;
  buyHoldPct: number;
  maxDrawdownPct: number;
  sharpe: number | null;
}
interface StrategyRow {
  id: string;
  label: string;
  description: string;
  glossaryKeys: string[];
  current: SignalSummary;
  stats: StatsSummary | null;
}
interface StrategyAnalysisDto {
  name: string | null;
  dataDate: string;
  periodStart: string;
  rows: StrategyRow[];
}
interface ApiResult<T> {
  success: boolean;
  message: string;
  data?: T;
}

interface StrategyAnalysisPanelProps {
  symbol: string;
}

const ACTION_LABEL: Record<SignalAction, string> = {
  BUY: '買進',
  SELL: '賣出',
  WAIT: '觀望',
};

/** 台股慣例：正報酬紅、負報酬綠。 */
function returnClass(v: number): string {
  if (v === 0) {
    return 'text-gray-500';
  }
  return v > 0 ? 'text-red-600' : 'text-green-600';
}

function fmtSignedPct(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

/** 即時訊號的時間註記：今日 / N 根 K 棒前 / 無訊號。 */
function timingText(current: SignalSummary): string {
  if (current.action === 'WAIT') {
    return '近期無訊號';
  }
  if (current.freshToday) {
    return '今日';
  }
  return current.barsAgo != null ? `${current.barsAgo} 根 K 棒前` : '—';
}

/**
 * 多策略分析面板：對 5 個內建技術策略一次性呈現「即時訊號 + 回測績效」。
 * 訊號與績效皆由 /api/v1/stock/strategy-analysis 一次回傳（同步、零佇列）。
 */
export function StrategyAnalysisPanel({ symbol }: StrategyAnalysisPanelProps) {
  const [data, setData] = useState<StrategyAnalysisDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/stock/strategy-analysis?symbol=${encodeURIComponent(symbol)}`,
      );
      const json = (await res.json()) as ApiResult<StrategyAnalysisDto>;
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setData(null);
        setError(json.message || '載入失敗');
      }
    } catch {
      setData(null);
      setError('載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-gray-400">載入中…</p>;
  }
  if (error || !data) {
    return <p className="text-sm text-gray-400">{error ?? '尚無資料'}</p>;
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">多策略分析</h3>
      <p className="mb-3 text-xs text-gray-500">
        以 5 個內建技術策略各自評估這檔股票：「目前訊號」是各策略最近一次買/賣的方向，
        「回測績效」是該策略套用在這檔歷史資料的表現。
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2 pr-3 font-medium">策略</th>
              <th className="py-2 pr-3 font-medium">目前訊號</th>
              <th className="py-2 pr-3 font-medium">回測勝率</th>
              <th className="py-2 pr-3 font-medium">總報酬（vs 買進持有）</th>
              <th className="py-2 pr-3 font-medium">交易次數</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const verdict = actionVerdict(
                row.current.action === 'WAIT' ? 'HOLD' : row.current.action,
              );
              const stats = row.stats;
              return (
                <tr key={row.id} className="border-b align-top last:border-0">
                  <td className="py-3 pr-3">
                    <div className="font-medium">
                      <TermLabel termKey={row.glossaryKeys[0] as GlossaryKey} text={row.label} />
                    </div>
                    <div className="mt-0.5 max-w-[18rem] text-xs text-gray-400">{row.description}</div>
                  </td>
                  <td className="py-3 pr-3">
                    <PlainVerdict tone={verdict.tone}>{ACTION_LABEL[row.current.action]}</PlainVerdict>
                    <div className="mt-1 text-xs text-gray-400">
                      {timingText(row.current)}
                      {row.current.signalDate ? ` ・ ${row.current.signalDate}` : ''}
                    </div>
                  </td>
                  {stats && stats.totalTrades > 0 ? (
                    <>
                      <td className="py-3 pr-3 tabular-nums">{stats.winRate.toFixed(1)}%</td>
                      <td className="py-3 pr-3">
                        <span className={`tabular-nums font-medium ${returnClass(stats.totalReturnPct)}`}>
                          {fmtSignedPct(stats.totalReturnPct)}
                        </span>
                        <span className="ml-1 text-xs text-gray-400">
                          （買進持有 {fmtSignedPct(stats.buyHoldPct)}）
                        </span>
                        {stats.totalReturnPct > stats.buyHoldPct && (
                          <span className="ml-1 text-xs font-medium text-red-600">▲ 勝過大盤</span>
                        )}
                        <div className="mt-0.5 text-xs text-gray-400">
                          最大回撤 {stats.maxDrawdownPct.toFixed(1)}%
                          {stats.sharpe != null ? ` ・ 夏普 ${stats.sharpe.toFixed(2)}` : ''}
                        </div>
                      </td>
                      <td className="py-3 pr-3 tabular-nums">{stats.totalTrades}</td>
                    </>
                  ) : (
                    <td className="py-3 pr-3 text-gray-400" colSpan={3}>
                      {stats ? '回測期間無交易訊號' : '資料不足，無法回測'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DataSourceTag source={DataSourceKey.SYSTEM_SCORE} date={data.dataDate} dateLabel="資料截至" />
      <p className="mt-0.5 text-xs text-gray-400">
        回測期間：{data.periodStart} ~ {data.dataDate}・策略訊號與回測結果僅供參考，非投資建議。
      </p>
    </div>
  );
}
