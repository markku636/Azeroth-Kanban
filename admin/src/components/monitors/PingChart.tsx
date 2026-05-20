/**
 * PingChart —— 用 Recharts 畫最近 N 次 check 的回應時間面積圖。
 *
 * checks 預期是「desc」(新→舊)的順序,內部會 reverse,讓視覺上「左舊右新」。
 * FAIL / MAINTENANCE / SKIPPED 的點 ms=0,讓視覺上看得出失敗時的下沉。
 */
"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

interface PingCheck {
  result: string;
  latencyMs: number | null;
  checkedAt: string;
}

const SIZE_PX: Record<"sm" | "lg", string> = {
  sm: "h-12",
  lg: "h-32",
};

export interface PingChartProps {
  checks: PingCheck[];
  size?: "sm" | "lg";
  /** 取最後幾筆畫,預設 50 */
  slots?: number;
  /** 用 unique gradient id 避免同頁多個圖共用 def 出問題 */
  gradientId?: string;
}

export function PingChart({
  checks,
  size = "sm",
  slots = 50,
  gradientId = "kumaPingGrad",
}: PingChartProps) {
  const ordered = [...checks].reverse();
  const data = ordered.slice(-slots).map((c, i) => ({
    i,
    ms: c.result === "OK" ? c.latencyMs ?? 0 : 0,
    result: c.result,
    timestamp: c.checkedAt,
  }));

  if (data.length < 2) return <div className={`w-full ${SIZE_PX[size]}`} />;

  return (
    <div className={`w-full ${SIZE_PX[size]}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
