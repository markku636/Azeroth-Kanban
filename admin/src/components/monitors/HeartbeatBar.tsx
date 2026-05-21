/**
 * HeartbeatBar —— Uptime Kuma 風格的 heartbeat 直條。
 *
 * 給 monitor 列表卡片(size="sm")與 detail 頁(size="lg")共用。
 *
 * checks 預期是「desc」(新→舊)的順序,內部會 reverse,讓視覺上「左舊右新」。
 * slots 預設 50;沒填滿的位置顯示灰格。
 */
"use client";

interface HeartbeatCheck {
  id?: string;
  result: string;
  /** 公開 status page 不傳此欄,故 optional */
  latencyMs?: number | null;
  /** 公開 status page 不傳此欄(避免外洩內部錯誤訊息),故 optional */
  detail?: string | null;
  checkedAt: string;
}

const SIZE_PX: Record<"sm" | "lg", { h: string; w: string }> = {
  sm: { h: "h-7", w: "w-1.5" },
  lg: { h: "h-10", w: "w-2" },
};

export interface HeartbeatBarProps {
  checks: HeartbeatCheck[];
  /** 視覺尺寸,sm 給卡片用、lg 給 detail 頁用 */
  size?: "sm" | "lg";
  /** 顯示格數,預設 50 */
  slots?: number;
  /** 退路:當 checks 是空、但 monitor 有最近一次結果時用這個畫一格 */
  fallbackLastResult?: string | null;
}

export function HeartbeatBar({ checks, size = "sm", slots = 50, fallbackLastResult }: HeartbeatBarProps) {
  const { h, w } = SIZE_PX[size];
  const ordered = [...checks].reverse();
  const tail = ordered.slice(-slots);
  const padding = slots - tail.length;

  if (tail.length === 0 && fallbackLastResult) {
    return (
      <div className={`flex ${h} items-end gap-[2px]`}>
        {Array.from({ length: slots - 1 }).map((_, i) => (
          <span key={i} className={`${h} ${w} rounded-sm bg-gray-200`} />
        ))}
        <span
          className={`${h} ${w} animate-pulse rounded-sm ${resultColor(fallbackLastResult)}`}
          title={fallbackLastResult}
        />
      </div>
    );
  }

  return (
    <div className={`flex ${h} items-end gap-[2px] overflow-hidden`}>
      {Array.from({ length: padding }).map((_, i) => (
        <span key={`p-${i}`} className={`${h} ${w} rounded-sm bg-gray-200`} />
      ))}
      {tail.map((c, i) => {
        const isLast = i === tail.length - 1;
        const title = `${new Date(c.checkedAt).toLocaleString("zh-TW")} · ${c.latencyMs ?? "-"}ms · ${c.detail ?? c.result}`;
        return (
          <span
            key={(c.id ?? c.checkedAt) + i}
            title={title}
            className={`${h} ${w} rounded-sm ${resultColor(c.result)} ${isLast ? "animate-pulse" : ""}`}
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
