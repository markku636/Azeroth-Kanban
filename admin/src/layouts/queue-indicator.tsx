"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Popover, Title, Badge, ActionIcon } from "rizzui";
import {
  PiCpuDuotone,
  PiHourglassMediumDuotone,
  PiCheckCircleDuotone,
} from "react-icons/pi";
import { useMedia } from "@/hooks/use-media";
import SimpleBar from "@/components/ui/simplebar";

interface QueueItem {
  jobId: string;
  projectId: string;
  projectTitle: string;
  mode: string;
  shotCount: number;
  owned: boolean;
  ts: number | null;
}
interface ActiveItem extends QueueItem {
  current?: {
    stage: string;
    pct?: number;
    status?: string;
    shotIndex?: number;
    shotTotal?: number;
    shotLabel?: string;
    ageSec: number;
  };
}
interface QueueStatus {
  active: ActiveItem[];
  waiting: QueueItem[];
  delayed: QueueItem[];
  counts: { active: number; waiting: number; delayed: number; completed: number; failed: number };
  comfy?: { running: number; pending: number };
  degraded?: boolean;
  fetchedAt: number;
}

const STAGE_LABEL: Record<string, string> = {
  plan: "規劃",
  gate: "等待確認",
  keyframe: "生成關鍵幀",
  voice: "配音",
  video: "生成影片",
  assemble: "合成",
  done: "完成",
  "keyframes-done": "關鍵幀完成",
  error: "錯誤",
};
const stageLabel = (s?: string) => (s ? STAGE_LABEL[s] ?? s : "");

// 佇列下拉內容：仿通知中心樣式（圖示框＋標題＋副標＋右側徽章），列出正在跑與排隊中。
function QueuePanel({
  data,
  loading,
  onNavigate,
}: {
  data: QueueStatus | null;
  loading: boolean;
  onNavigate: () => void;
}) {
  const idle = !!data && data.active.length === 0 && data.counts.active === 0;
  const pendingList = data ? [...data.waiting, ...data.delayed] : [];
  const pendingTotal = data ? data.counts.waiting + data.counts.delayed : 0;

  return (
    <div className="w-[320px] text-left sm:w-[360px] 2xl:w-[420px] rtl:text-right">
      <div className="mb-3 flex items-center justify-between ps-6 pe-3">
        <Title as="h5">GPU 佇列</Title>
        {data && (
          <span className="text-xs text-gray-500">
            {data.degraded ? "服務暫停" : idle ? "閒置中" : "執行中"}
          </span>
        )}
      </div>

      <SimpleBar className="max-h-[420px]">
        <div className="ps-4 pe-3">
          {!data && loading ? (
            <div className="flex items-center justify-center py-10">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-r-transparent" />
            </div>
          ) : (
            <>
              {/* ── 正在跑 ── */}
              {idle ? (
                <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-3 text-sm text-green-700 dark:bg-gray-50">
                  <PiCheckCircleDuotone className="h-5 w-5 shrink-0" /> GPU 閒置中，沒有任務在跑。
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1">
                  {data?.active.map((j) => {
                    const c = j.current;
                    const pct = c?.pct != null ? Math.round(c.pct * 100) : null;
                    return (
                      <div
                        key={j.jobId}
                        className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md px-2 py-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-50"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded bg-blue-100/70 dark:bg-gray-50/50">
                          <PiCpuDuotone className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <Title as="h6" className="truncate text-sm font-semibold">
                              {j.projectTitle}
                            </Title>
                            <Badge color="info" variant="flat" size="sm" className="shrink-0">
                              {j.mode}
                            </Badge>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                              {stageLabel(c?.stage) || "處理中"}
                            </span>
                            {c?.shotIndex && c.shotTotal ? (
                              <span>
                                第 {c.shotIndex}/{c.shotTotal} 鏡
                              </span>
                            ) : null}
                            {pct != null && <span>{pct}%</span>}
                          </div>
                          {pct != null && (
                            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-50">
                              <div
                                className="h-full rounded-full bg-blue-600 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── 排隊中 ── */}
              <div className="mb-1 mt-3 flex items-center gap-1.5 ps-2 text-xs font-semibold text-gray-500">
                <PiHourglassMediumDuotone className="h-3.5 w-3.5" /> 排隊中
                <span className="text-gray-400">{pendingTotal}</span>
              </div>
              {pendingTotal === 0 ? (
                <div className="rounded-md px-2 py-2 text-xs text-gray-400">沒有排隊中的任務。</div>
              ) : (
                <div className="grid grid-cols-1 gap-0.5">
                  {pendingList.map((j, i) => (
                    <div
                      key={j.jobId}
                      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-50"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500 dark:bg-gray-50">
                        {i + 1}
                      </span>
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="truncate text-sm text-gray-700">{j.projectTitle}</span>
                        <Badge color="secondary" variant="flat" size="sm" className="shrink-0">
                          {j.mode}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {pendingTotal > pendingList.length && (
                    <div className="px-2 pt-1 text-xs text-gray-400">
                      …還有 {pendingTotal - pendingList.length} 個未顯示
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </SimpleBar>

      <Link
        href="/studio/queue"
        onClick={onNavigate}
        className="-me-3 mt-1 block px-6 pb-0.5 pt-3 text-center text-sm hover:underline"
      >
        查看完整佇列
      </Link>
    </div>
  );
}

// 右上角 GPU 佇列：點擊展開下拉（仿通知中心），顯示正在跑 / 排隊中；忙碌時藍燈閃爍 + 排隊數字。
// 輕量輪詢（閒置 5s、展開時 2.5s，分頁隱藏時暫停）；無 Studio 權限(401/403)即隱藏並停止。
export default function QueueIndicator() {
  const pathname = usePathname();
  const isAgentPortal = pathname.startsWith("/agent");
  const isMobile = useMedia("(max-width: 480px)", false);
  const [data, setData] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const seq = useRef(0); // 丟棄較慢的舊請求，避免倒退覆蓋

  useEffect(() => {
    if (isAgentPortal || hidden) return;
    let stopped = false;
    const stop = () => {
      stopped = true;
      if (timer.current) clearInterval(timer.current);
    };
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      const mine = ++seq.current;
      try {
        const res = await fetch("/api/v1/studio/queue", { cache: "no-store" });
        if (res.status === 401 || res.status === 403) {
          setHidden(true);
          stop();
          return;
        }
        if (!res.ok) return;
        const j = await res.json();
        if (!stopped && mine === seq.current) setData(j.data as QueueStatus);
      } catch {
        /* best-effort */
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    };
    void load();
    timer.current = setInterval(load, isOpen ? 2500 : 5000);
    return stop;
  }, [isAgentPortal, hidden, isOpen]);

  if (isAgentPortal || hidden) return null;

  const busy = (data?.active.length ?? 0) > 0 || (data?.counts.active ?? 0) > 0;
  const pending = data ? data.counts.waiting + data.counts.delayed : 0;
  const active = data?.active[0];
  const title = busy
    ? `GPU 正在跑：${active?.projectTitle ?? ""}${active?.current?.shotIndex ? `（第 ${active.current.shotIndex}/${active.current.shotTotal} 鏡）` : ""}`
    : pending > 0
      ? `GPU 閒置，${pending} 個任務排隊中`
      : "GPU 閒置";

  return (
    <Popover
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      shadow="sm"
      placement={isMobile ? "bottom" : "bottom-end"}
    >
      <Popover.Trigger>
        <ActionIcon
          aria-label={title}
          title={title}
          variant="text"
          className="relative h-[34px] w-[34px] shadow backdrop-blur-md md:h-9 md:w-9 dark:bg-gray-100"
        >
          <PiCpuDuotone className={`h-[18px] w-auto ${busy ? "text-blue-600" : ""}`} />
          {busy && (
            <Badge
              renderAsDot
              color="info"
              enableOutlineRing
              className="absolute right-2.5 top-2.5 -translate-y-1/3 translate-x-1/2 animate-pulse"
            />
          )}
          {pending > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold leading-none text-white">
              {pending > 99 ? "99+" : pending}
            </span>
          )}
        </ActionIcon>
      </Popover.Trigger>
      <Popover.Content className="z-[9999] px-0 pb-4 pe-6 pt-5 dark:bg-gray-100 [&>svg]:hidden sm:[&>svg]:inline-flex [&>svg]:dark:fill-gray-100">
        <QueuePanel data={data} loading={loading} onNavigate={() => setIsOpen(false)} />
      </Popover.Content>
    </Popover>
  );
}
