/**
 * Next.js instrumentation —— server 啟動時執行一次。
 * 啟動背景作業計時器:即使沒有外部流量,服務也持續產生日誌,被注入的故障隨時間顯現。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { log } = await import("./lib/logger");
  const { getMode, leakMemory, leakedBytes, burnCpu, rssMb } = await import("./lib/chaos");

  const service = process.env.SERVICE_NAME ?? "sim-service";
  log("INFO", `${service} started, background worker online`, { route: "startup" });

  // crash 模式:啟動後短暫運作即退出 → 容器自動重啟 → 再次讀到持久化的 crash → 反覆 = crashloop
  if (getMode() === "crash") {
    log("ERROR", "FATAL: service failed to initialize — dependency init threw on startup", {
      route: "startup",
      status: 500,
    });
    setTimeout(() => process.exit(1), 8000);
    return;
  }

  // 每 5 秒一次背景作業 tick
  setInterval(() => {
    const mode = getMode();

    if (mode === "memory-leak") {
      leakMemory(2000);
      const leakMb = Math.round(leakedBytes() / 1_048_576);
      const rss = rssMb();
      if (rss > 200) {
        log("ERROR", "heap pressure critical — allocation failing, OOM imminent", {
          route: "background",
          rssMb: rss,
          leakMb,
        });
      } else {
        log("WARN", "memory usage climbing steadily (possible leak)", {
          route: "background",
          rssMb: rss,
          leakMb,
        });
      }
      return;
    }

    if (mode === "cpu-spin") {
      burnCpu(900);
      log("WARN", "event loop blocked — sustained high CPU utilization", { route: "background" });
      return;
    }

    if (mode === "error-5xx") {
      log("ERROR", "background job failed: unhandled exception in handler (HTTP 500)", {
        route: "background",
        status: 500,
      });
      return;
    }

    if (mode === "crash") {
      log("ERROR", "FATAL: simulated crash — process exiting", { route: "background", status: 500 });
      setTimeout(() => process.exit(1), 500);
      return;
    }

    log("INFO", "background job tick completed", { route: "background", status: 200 });
  }, 5000);
}
