'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GlobalMarketData, UsIndexQuote, FuturesInstitutionOi } from '@azeroth/common';
import { TermLabel } from '@/components/stock/term-label';

/** POST 後等待 worker 完成再重新整理的延遲。 */
const RELOAD_DELAY_MS = 10_000;

interface ApiResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
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
function fmtPoint(v: number | null | undefined): string {
  if (v === null || v === undefined) {
    return '—';
  }
  return `${v > 0 ? '+' : ''}${v.toLocaleString()}`;
}
function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) {
    return '—';
  }
  return v.toLocaleString();
}

/** 美股指數中文短名（symbol → 顯示）。 */
const US_INDEX_LABEL: Record<string, string> = {
  '^DJI': '道瓊',
  '^GSPC': 'S&P 500',
  '^IXIC': '那斯達克',
  '^SOX': '費城半導體',
};

export default function GlobalBoard() {
  const [data, setData] = useState<GlobalMarketData | null>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/v1/stock/global');
    const json = (await res.json()) as ApiResult<GlobalMarketData>;
    if (json.success && json.data) {
      setData(json.data);
      setMsg('');
    } else {
      setData(null);
      setMsg(json.message || '尚無國際盤資料');
    }
    setLoading(false);
  }, []);

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
    const res = await fetch('/api/v1/stock/global', { method: 'POST' });
    const json = (await res.json()) as ApiResult;
    if (!json.success) {
      setMsg(json.message || '國際盤更新失敗');
      return;
    }
    setMsg(`已送出更新，約 ${RELOAD_DELAY_MS / 1000} 秒後重新整理…`);
    if (reloadTimer.current) {
      clearTimeout(reloadTimer.current);
    }
    reloadTimer.current = setTimeout(() => void load(), RELOAD_DELAY_MS);
  };

  return (
    <section className="rounded-lg border p-4">
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">
          <TermLabel termKey="GLOBAL_INDEX" text="國際盤 / 期貨夜盤" />
        </h2>
        {data && <span className="text-xs text-gray-500">{data.date}</span>}
        <button
          className="rounded bg-green-600 px-3 py-1.5 text-sm text-white"
          onClick={() => void update()}
        >
          更新國際盤
        </button>
        {loading && <span className="text-xs text-gray-400">載入中…</span>}
      </header>
      {msg && <p className="mb-3 text-sm text-gray-500">{msg}</p>}

      {data && (
        <div className="space-y-4">
          {/* 美股四大指數 */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.usIndices.map((idx) => (
              <UsIndexCard key={idx.symbol} idx={idx} />
            ))}
            {data.usIndices.length === 0 && (
              <p className="text-sm text-gray-400">美股指數暫無資料</p>
            )}
          </div>

          {/* 台指期夜盤 + 期現價差 */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border p-3">
              <div className="mb-1 text-sm text-gray-500">
                <TermLabel termKey="TXF" text="台指期夜盤（近月）" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${changeClass(data.txfNight.changePoint)}`}>
                  {fmtNum(data.txfNight.close)}
                </span>
                <span className={`text-sm font-medium ${changeClass(data.txfNight.changePoint)}`}>
                  {fmtPoint(data.txfNight.changePoint)}　{fmtPct(data.txfNight.changePct)}
                </span>
              </div>
            </div>
            <div className="rounded border p-3">
              <div className="mb-1 text-sm text-gray-500">
                <TermLabel termKey="BASIS" text="期現價差（基差）" />
              </div>
              <div className={`text-2xl font-bold ${changeClass(data.txfNight.basis)}`}>
                {fmtPoint(data.txfNight.basis)}
              </div>
              <div className="mt-1 text-xs text-gray-400">
                夜盤 − 加權指數收盤；負值＝偏空（隔日開盤偏弱）
              </div>
            </div>
          </div>

          {/* 三大法人台指期未平倉 */}
          {data.futChips && (
            <div className="rounded border p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-medium">
                  <TermLabel termKey="INSTITUTIONS" text="三大法人台指期未平倉（口）" />
                </span>
                <span className="text-xs text-gray-400">{data.futChips.date}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-1">法人</th>
                    <th className="text-right">
                      <TermLabel termKey="LONG_SHORT_OI" text="多單" />
                    </th>
                    <th className="text-right">
                      <TermLabel termKey="LONG_SHORT_OI" text="空單" />
                    </th>
                    <th className="text-right">
                      <TermLabel termKey="OPEN_INTEREST" text="淨未平倉" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <ChipRow label="外資" oi={data.futChips.foreign} />
                  <ChipRow label="投信" oi={data.futChips.trust} />
                  <ChipRow label="自營商" oi={data.futChips.dealer} />
                </tbody>
              </table>
              <div className="mt-1 text-xs text-gray-400">淨未平倉正＝偏多、負＝偏空</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function UsIndexCard({ idx }: { idx: UsIndexQuote }) {
  const label = US_INDEX_LABEL[idx.symbol] ?? idx.name;
  return (
    <div className="rounded border p-3">
      <div className="mb-1 truncate text-sm text-gray-500" title={idx.name}>
        {label}
      </div>
      <div className={`text-xl font-bold ${changeClass(idx.changePoint)}`}>{fmtNum(idx.close)}</div>
      <div className={`text-sm ${changeClass(idx.changePoint)}`}>
        {fmtPoint(idx.changePoint)}　{fmtPct(idx.changePct)}
      </div>
    </div>
  );
}

function ChipRow({ label, oi }: { label: string; oi: FuturesInstitutionOi }) {
  return (
    <tr className="border-t">
      <td className="py-1">{label}</td>
      <td className="text-right">{oi.longOi.toLocaleString()}</td>
      <td className="text-right">{oi.shortOi.toLocaleString()}</td>
      <td className={`text-right font-medium ${changeClass(oi.netOi)}`}>{fmtPoint(oi.netOi)}</td>
    </tr>
  );
}
