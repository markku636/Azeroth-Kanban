/**
 * MonitorsKumaView —— 對接你既有 admin 的 /api/v1/monitors API,
 * 把列表表格改成 Uptime Kuma 風格的 card grid:
 *
 *   ┌─ StatusBadge │ SEV │ kind                                          ─┐
 *   │ name                                                                │
 *   │ service / url                                                       │
 *   │ heartbeat bar (近 50 次 result)                                     │
 *   │ 24h Uptime │ 7d Uptime │ 30d Uptime                                 │
 *   │ ping chart (Recharts area)                                          │
 *   │ tags                                                                │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * 設計要點:
 *   - 不打 push token / 不改後端,只讀 /api/v1/monitors/[id]/stats 拿到 recentChecks + uptime + latency
 *   - 每個 monitor 的 stats 各別 fetch,完成後寫進共用的 statsById Map
 *   - 整張卡片可點擊轉跳到 /monitors/[id](由父層注入 onMonitorClick)
 *
 * 用法:
 *   把 page.tsx 中原本 <div className="space-y-6">...</div>(表格段) 整段替換為:
 *     <MonitorsKumaView
 *       monitors={filtered}
 *       loading={loading}
 *       onMonitorClick={(id) => router.push(`/monitors/${id}`)}
 *     />
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PiPulseDuotone, PiTagDuotone } from "react-icons/pi";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

import StatusBadge, { type StatusType } from "@/components/status-badge";

/** 由 page.tsx 傳進來的 monitor 列表項(對齊 /api/v1/monitors 的回傳)。 */
export interface MonitorRow {
  id: string;
  name: string;
  kind: "HTTP" | "TCP" | "KEYWORD" | "PUSH" | "LOG";
  enabled: boolean;
  state: string;
  service: string | null;
  url: string | null;
  intervalSeconds: number;
  severity: string;
  lastCheckedAt: string | null;
  lastResult: string | null;
  lastLatencyMs: number | null;
  tags: string[];
  groupName: string | null;
  openIncidentId: string | null;
}

/** /api/v1/monitors/[id]/stats 的回傳。 */
interface MonitorStats {
  uptime: { "24h": number | null; "7d": number | null; "30d": number | null };
  latency: { avgMs: number | null; p95Ms: number | null };
  recentChecks: Array<{
    id: string;
    result: string;
    magnitude: number | null;
    latencyMs: number | null;
    detail: string | null;
    checkedAt: string;
  }>;
  totalChecks: number;
}

const STATE_COLOR: Record<string, StatusType> = {
  UP: "success",
  DOWN: "error",
  PENDING: "pending",
  PAUSED: "free",
  MAINTENANCE: "info",
};
const STATE_LABEL: Record<string, string> = {
  UP: "UP",
  DOWN: "DOWN",
  PENDING: "等待中",
  PAUSED: "停用",
  MAINTENANCE: "維護中",
};
const KIND_LABEL: Record<string, string> = {
  HTTP: "HTTP",
  TCP: "TCP",
  KEYWORD: "關鍵字",
  PUSH: "心跳",
  LOG: "日誌",
};
const SEV_COLOR: Record<string, StatusType> = {
  SEV1: "error",
  SEV2: "warning",
  SEV3: "info",
  SEV4: "free",
};

export interface MonitorsKumaViewProps {
  monitors: MonitorRow[];
  loading: boolean;
  onMonitorClick?: (id: string) => void;
  /** stats 抓取間隔(秒),預設 30 */
  statsRefreshSeconds?: number;
}

export function MonitorsKumaView({
  monitors,
  loading,
  onMonitorClick,
  statsRefreshSeconds = 30,
}: MonitorsKumaViewProps) {
  // 依 group 分組
  const grouped = useMemo(() => {
    const map = new Map<string, MonitorRow[]>();
    for (const m of monitors) {
      const key = m.groupName ?? "未分組";
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [monitors]);

  if (loading && monitors.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-0 p-8 text-center shadow dark:bg-gray-100">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
        <p className="mt-4 text-sm text-gray-500">載入中...</p>
      </div>
    );
  }
  if (grouped.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-0 p-8 text-center text-sm text-gray-500 shadow dark:bg-gray-100">
        {monitors.length === 0
          ? "尚未設定任何監控。點右上角「新增監控」開始。"
          : "沒有符合篩選的監控。"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(([group, rows]) => (
        <section key={group}>
          <h2 className="mb-3 text-xs font-semibold uppercase text-gray-400">{group}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((m) => (
              <MonitorCard
                key={m.id}
                monitor={m}
                statsRefreshSeconds={statsRefreshSeconds}
                onClick={() => onMonitorClick?.(m.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MonitorCard ── 單張卡片(自己 fetch 對應的 stats)
// ────────────────────────────────────────────────────────────────────────────

function MonitorCard({
  monitor,
  statsRefreshSeconds,
  onClick,
}: {
  monitor: MonitorRow;
  statsRefreshSeconds: number;
  onClick: () => void;
}) {
  const [stats, setStats] = useState<MonitorStats | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        const res = await fetch(`/api/v1/monitors/${monitor.id}/stats`, {
          signal: ctl.signal,
        });
        const json = await res.json();
        if (!cancelled && json?.success && json.data) setStats(json.data as MonitorStats);
      } catch {
        // 靜默失敗 —— heartbeat bar 會降級為僅顯示 lastResult
      }
    }
    void load();
    const timer = setInterval(load, Math.max(15, statsRefreshSeconds) * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [monitor.id, statsRefreshSeconds]);

  const checks = stats?.recentChecks ?? [];

  return (
    <article
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-gray-200 bg-gray-0 p-4 shadow transition hover:border-blue-300 hover:shadow-md dark:bg-gray-100"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge
              status={STATE_COLOR[monitor.state] ?? "info"}
              label={STATE_LABEL[monitor.state] ?? monitor.state}
              size="sm"
            />
            <StatusBadge status={SEV_COLOR[monitor.severity] ?? "info"} label={monitor.severity} size="sm" />
            <span className="text-[10px] uppercase tracking-wider text-gray-400">
              {KIND_LABEL[monitor.kind] ?? monitor.kind}
            </span>
            {!monitor.enabled && <span className="text-[10px] text-gray-400">(停用)</span>}
          </div>
          <h3 className="mt-1.5 truncate text-sm font-semibold text-gray-900" title={monitor.name}>
            {monitor.name}
          </h3>
          <p className="truncate font-mono text-xs text-gray-500">
            {monitor.service ?? monitor.url ?? "—"}
          </p>
        </div>
        <PiPulseDuotone className="h-5 w-5 shrink-0 text-blue-600" />
      </div>

      <div className="mt-4">
        <HeartbeatBar checks={checks} fallbackLastResult={monitor.lastResult} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <StatCell label="24h Uptime" value={formatPct(stats?.uptime["24h"])} />
        <StatCell label="7d Uptime" value={formatPct(stats?.uptime["7d"])} />
        <StatCell label="30d Uptime" value={formatPct(stats?.uptime["30d"])} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <StatCell label="avg latency" value={formatMs(stats?.latency.avgMs)} />
        <StatCell label="p95 latency" value={formatMs(stats?.latency.p95Ms)} />
      </div>

      <div className="mt-3">
        <PingChart checks={checks} />
      </div>

      <p className="mt-2 truncate text-[11px] text-gray-500">
        {monitor.lastCheckedAt
          ? `${new Date(monitor.lastCheckedAt).toLocaleString("zh-TW")}`
          : "尚未檢查"}
        {monitor.lastLatencyMs != null && (
          <span className="ml-2 text-gray-400">{monitor.lastLatencyMs}ms</span>
        )}
        {monitor.openIncidentId && (
          <span className="ml-2 inline-flex items-center rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
            事故中
          </span>
        )}
      </p>

      {monitor.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {monitor.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
            >
              <PiTagDuotone className="h-3 w-3" />
              {t}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
      <div className="font-mono text-sm text-gray-900">{value}</div>
    </div>
  );
}

function formatPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(2)}%`;
}

function formatMs(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v} ms`;
}

// ────────────────────────────────────────────────────────────────────────────
// HeartbeatBar ── 50 格直條
// ────────────────────────────────────────────────────────────────────────────

const SLOTS = 50;

function HeartbeatBar({
  checks,
  fallbackLastResult,
}: {
  checks: Array<{ result: string; latencyMs: number | null; detail: string | null; checkedAt: string }>;
  fallbackLastResult: string | null;
}) {
  // recentChecks 是「desc」(新→舊),要倒成「舊→新」才符合視覺上「左舊右新」
  const ordered = [...checks].reverse();
  const tail = ordered.slice(-SLOTS);
  const padding = SLOTS - tail.length;

  // 沒抓到 stats 的退路:用 lastResult 畫一格
  if (tail.length === 0 && fallbackLastResult) {
    return (
      <div className="flex h-7 items-end gap-[2px]">
        {Array.from({ length: SLOTS - 1 }).map((_, i) => (
          <span key={i} className="h-7 w-1.5 rounded-sm bg-gray-200" />
        ))}
        <span
          className={`h-7 w-1.5 animate-pulse rounded-sm ${resultColor(fallbackLastResult)}`}
          title={fallbackLastResult}
        />
      </div>
    );
  }

  return (
    <div className="flex h-7 items-end gap-[2px] overflow-hidden">
      {Array.from({ length: padding }).map((_, i) => (
        <span key={`p-${i}`} className="h-7 w-1.5 rounded-sm bg-gray-200" />
      ))}
      {tail.map((c, i) => {
        const isLast = i === tail.length - 1;
        const title = `${new Date(c.checkedAt).toLocaleString("zh-TW")} · ${c.latencyMs ?? "-"}ms · ${c.detail ?? c.result}`;
        return (
          <span
            key={c.checkedAt + i}
            title={title}
            className={`h-7 w-1.5 rounded-sm ${resultColor(c.result)} ${isLast ? "animate-pulse" : ""}`}
          />
        );
      })}
    </div>
  );
}

function resultColor(result: string): string {
  switch (result) {
    case "OK":
      return "bg-emerald-500";
    case "FAIL":
      return "bg-rose-500";
    case "MAINTENANCE":
      return "bg-amber-400";
    case "SKIPPED":
      return "bg-gray-300";
    default:
      return "bg-gray-200";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PingChart ── 用 Recharts 畫近 50 次回應時間
// ────────────────────────────────────────────────────────────────────────────

function PingChart({
  checks,
}: {
  checks: Array<{ result: string; latencyMs: number | null; checkedAt: string }>;
}) {
  const ordered = [...checks].reverse();
  const data = ordered.slice(-50).map((c, i) => ({
    i,
    ms: c.result === "OK" ? c.latencyMs ?? 0 : 0,
    result: c.result,
    timestamp: c.checkedAt,
  }));

  if (data.length < 2) return <div className="h-12 w-full" />;

  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="kumaPingGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, "dataMax + 20"]} />
          <Tooltip
            cursor={{ stroke: "#94a3b8", strokeWidth: 1 }}
            contentStyle={{
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              fontSize: 11,
              padding: "4px 8px",
            }}
            labelFormatter={() => ""}
            formatter={(value, _name, p) => {
              const pt = p?.payload as { result: string; timestamp: string } | undefined;
              return [
                `${value} ms · ${pt?.result ?? ""}`,
                pt?.timestamp ? new Date(pt.timestamp).toLocaleTimeString("zh-TW") : "",
              ];
            }}
          />
          <Area
            type="monotone"
            dataKey="ms"
            stroke="#2563eb"
            strokeWidth={1.5}
            fill="url(#kumaPingGrad)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
