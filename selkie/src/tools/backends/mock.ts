/**
 * Mock 後端 —— 內建一致、可推理的假資料,讓 agent 無需任何雲端憑證即可端到端測試。
 *
 * 內含兩個事故情境:
 *  • INC-1024: checkout-api 因部署 PR #482(未設上限的記憶體快取)→ OOMKilled → crashloop。
 *  • INC-1025: payments-api 因下游 bank-gateway 部署 PR #219(連線池調太小)→ 逾時。
 */
import type {
  Alert,
  Deploy,
  Incident,
  LogEntry,
  MetricSeries,
  PastIncident,
  PullRequest,
} from "../../schemas.js";
import type { OncallBackend } from "./types.js";

/** 由 [時間, 值] 配對建立 metric 點序列。 */
function pts(pairs: [string, number][]): { timestamp: string; value: number }[] {
  return pairs.map(([timestamp, value]) => ({ timestamp, value }));
}

// ──────────────────────────── 事故 ────────────────────────────

const INCIDENTS: Record<string, Incident> = {
  "INC-1024": {
    id: "INC-1024",
    title: "checkout-api 5xx 錯誤率飆升並出現 pod crashloop",
    service: "checkout-api",
    source: "pagerduty",
    status: "triggered",
    triggeredAt: "2026-05-19T14:05:00Z",
    severityHint: "high",
    description:
      "PagerDuty 告警:checkout-api HTTP 5xx 比例 > 25% 持續 5 分鐘,多個 pod 進入 CrashLoopBackOff。結帳功能受影響。",
    links: ["https://dashboards.example.com/d/checkout-api"],
  },
  "INC-1025": {
    id: "INC-1025",
    title: "payments-api 付款延遲與失敗率飆升",
    service: "payments-api",
    source: "pagerduty",
    status: "triggered",
    triggeredAt: "2026-05-19T16:20:00Z",
    severityHint: "high",
    description:
      "PagerDuty 告警:payments-api HTTP 5xx > 10% 持續 5 分鐘,p99 延遲 > 5s。多筆付款逾時失敗。",
    links: ["https://dashboards.example.com/d/payments-api"],
  },
};

// ──────────────────────────── 告警 ────────────────────────────

const ALERTS: Record<string, Alert[]> = {
  "checkout-api": [
    {
      name: "checkout-api pod 記憶體 > 95% limit",
      service: "checkout-api",
      status: "triggered",
      triggeredAt: "2026-05-19T14:01:00Z",
      detail: "容器記憶體使用率達 97%,逼近 limit。",
    },
    {
      name: "checkout-api p99 延遲 > 2s",
      service: "checkout-api",
      status: "triggered",
      triggeredAt: "2026-05-19T14:03:00Z",
      detail: "p99 延遲由 ~250ms 惡化至 2.9s。",
    },
    {
      name: "checkout-api pod CrashLoopBackOff",
      service: "checkout-api",
      status: "triggered",
      triggeredAt: "2026-05-19T14:04:00Z",
      detail: "3 個 pod 反覆重啟,restartCount 持續上升。",
    },
    {
      name: "checkout-api HTTP 5xx 比例 > 25%",
      service: "checkout-api",
      status: "triggered",
      triggeredAt: "2026-05-19T14:05:00Z",
      detail: "5xx 比例飆至約 31%。",
    },
  ],
  "payments-api": [
    {
      name: "payments-api p99 延遲 > 2s",
      service: "payments-api",
      status: "triggered",
      triggeredAt: "2026-05-19T16:18:00Z",
      detail: "p99 延遲升至 5s 以上。",
    },
    {
      name: "payments-api HTTP 5xx 比例 > 10%",
      service: "payments-api",
      status: "triggered",
      triggeredAt: "2026-05-19T16:20:00Z",
      detail: "付款逾時導致 5xx 比例約 12%。",
    },
  ],
  "bank-gateway": [
    {
      name: "bank-gateway 連線池耗盡",
      service: "bank-gateway",
      status: "triggered",
      triggeredAt: "2026-05-19T16:15:00Z",
      detail: "對外銀行 API 連線池 8/8 全滿,大量請求排隊。",
    },
  ],
};

// ──────────────────────────── 日誌 ────────────────────────────

const LOGS: Record<string, LogEntry[]> = {
  "checkout-api": [
    {
      timestamp: "2026-05-19T13:58:40Z",
      level: "INFO",
      service: "checkout-api",
      message: "Deployed version v2.8.0 (commit a1b2c3d) — rollout complete",
    },
    {
      timestamp: "2026-05-19T14:00:11Z",
      level: "WARN",
      service: "checkout-api",
      message: "GC pause 1.8s; old generation at 92% after full collection",
    },
    {
      timestamp: "2026-05-19T14:01:55Z",
      level: "WARN",
      service: "checkout-api",
      message: "GC overhead high: 6 full GCs in last 60s, heap not recovering",
    },
    {
      timestamp: "2026-05-19T14:02:33Z",
      level: "ERROR",
      service: "checkout-api",
      message:
        "java.lang.OutOfMemoryError: Java heap space\n\tat com.shop.checkout.cart.InMemoryCartCache.put(InMemoryCartCache.java:41)\n\tat com.shop.checkout.cart.CartService.saveCart(CartService.java:88)",
    },
    {
      timestamp: "2026-05-19T14:02:34Z",
      level: "ERROR",
      service: "checkout-api",
      message: "Unhandled exception in handler POST /checkout: OutOfMemoryError",
    },
    {
      timestamp: "2026-05-19T14:03:02Z",
      level: "INFO",
      service: "checkout-api",
      message: "Container terminated: reason=OOMKilled exitCode=137 pod=checkout-api-7c9d8",
    },
    {
      timestamp: "2026-05-19T14:03:05Z",
      level: "INFO",
      service: "checkout-api",
      message: "Pod checkout-api-7c9d8 restarting (restartCount=3) — entering CrashLoopBackOff",
    },
    {
      timestamp: "2026-05-19T14:04:10Z",
      level: "ERROR",
      service: "checkout-api",
      message: "java.lang.OutOfMemoryError: Java heap space (recurred ~90s after restart)",
    },
    {
      timestamp: "2026-05-19T14:05:12Z",
      level: "ERROR",
      service: "checkout-api",
      message: "Readiness probe failed: HTTP 503 — service not ready",
    },
  ],
  "payments-api": [
    {
      timestamp: "2026-05-19T16:13:50Z",
      level: "INFO",
      service: "payments-api",
      message: "Processing payment txn=tx_88213 amount=42.00",
    },
    {
      timestamp: "2026-05-19T16:15:20Z",
      level: "WARN",
      service: "payments-api",
      message: "Slow downstream call: bank-gateway /api/charge took 8200ms",
    },
    {
      timestamp: "2026-05-19T16:16:05Z",
      level: "ERROR",
      service: "payments-api",
      message:
        "java.net.SocketTimeoutException: Read timed out\n\tat com.shop.payments.gateway.BankGatewayClient.charge(BankGatewayClient.java:73) — calling http://bank-gateway/api/charge",
    },
    {
      timestamp: "2026-05-19T16:18:30Z",
      level: "ERROR",
      service: "payments-api",
      message: "Circuit breaker OPEN for downstream 'bank-gateway' after 20 consecutive failures",
    },
    {
      timestamp: "2026-05-19T16:20:00Z",
      level: "ERROR",
      service: "payments-api",
      message: "Payment failed: downstream dependency bank-gateway unavailable",
    },
  ],
  "bank-gateway": [
    {
      timestamp: "2026-05-19T16:12:30Z",
      level: "INFO",
      service: "bank-gateway",
      message: "Started with new config v3.4.0 (commit c0ffee1)",
    },
    {
      timestamp: "2026-05-19T16:15:00Z",
      level: "WARN",
      service: "bank-gateway",
      message: "Outbound connection pool exhausted: 8/8 in use, 142 requests queued",
    },
    {
      timestamp: "2026-05-19T16:16:00Z",
      level: "ERROR",
      service: "bank-gateway",
      message: "Request rejected: connection pool wait timeout exceeded (30s)",
    },
  ],
};

// ──────────────────────────── Metrics ────────────────────────────

const METRICS: Record<string, MetricSeries[]> = {
  "checkout-api": [
    {
      service: "checkout-api",
      metric: "memory_utilization_pct",
      unit: "% of container limit",
      points: pts([
        ["2026-05-19T13:50:00Z", 38],
        ["2026-05-19T13:54:00Z", 52],
        ["2026-05-19T13:58:00Z", 71],
        ["2026-05-19T14:00:00Z", 86],
        ["2026-05-19T14:02:00Z", 97],
        ["2026-05-19T14:04:00Z", 99],
        ["2026-05-19T14:06:00Z", 99],
      ]),
      summary:
        "記憶體使用率自 13:50 部署 v2.8.0 後持續單調攀升,14:02 達 97% 並貼著上限 → OOMKilled。",
    },
    {
      service: "checkout-api",
      metric: "error_rate_pct",
      unit: "% of requests",
      points: pts([
        ["2026-05-19T13:50:00Z", 0.2],
        ["2026-05-19T14:00:00Z", 0.4],
        ["2026-05-19T14:02:00Z", 8],
        ["2026-05-19T14:03:00Z", 31],
        ["2026-05-19T14:05:00Z", 34],
      ]),
      summary: "5xx 錯誤率在 14:02 後由 <0.5% 飆至約 31%,與 OOMKilled / 重啟時間吻合。",
    },
    {
      service: "checkout-api",
      metric: "latency_p99_ms",
      unit: "ms",
      points: pts([
        ["2026-05-19T13:50:00Z", 240],
        ["2026-05-19T14:01:00Z", 410],
        ["2026-05-19T14:03:00Z", 2900],
        ["2026-05-19T14:05:00Z", 3800],
      ]),
      summary: "p99 延遲自 14:01 起惡化,14:03 後達 3–4 秒。",
    },
    {
      service: "checkout-api",
      metric: "cpu_utilization_pct",
      unit: "% of container limit",
      points: pts([
        ["2026-05-19T13:50:00Z", 35],
        ["2026-05-19T14:00:00Z", 44],
        ["2026-05-19T14:03:00Z", 62],
      ]),
      summary: "CPU 略升但未飽和,瓶頸不在 CPU。",
    },
  ],
  "payments-api": [
    {
      service: "payments-api",
      metric: "latency_p99_ms",
      unit: "ms",
      points: pts([
        ["2026-05-19T16:00:00Z", 280],
        ["2026-05-19T16:10:00Z", 300],
        ["2026-05-19T16:15:00Z", 1200],
        ["2026-05-19T16:20:00Z", 5200],
      ]),
      summary: "p99 在 16:15 後由 ~300ms 升至 ~5s。",
    },
    {
      service: "payments-api",
      metric: "error_rate_pct",
      unit: "% of requests",
      points: pts([
        ["2026-05-19T16:00:00Z", 0.5],
        ["2026-05-19T16:15:00Z", 2],
        ["2026-05-19T16:20:00Z", 12],
      ]),
      summary: "錯誤率在 16:15 後上升,主要為下游逾時造成的 5xx。",
    },
    {
      service: "payments-api",
      metric: "memory_utilization_pct",
      unit: "% of container limit",
      points: pts([
        ["2026-05-19T16:00:00Z", 54],
        ["2026-05-19T16:15:00Z", 56],
        ["2026-05-19T16:20:00Z", 55],
      ]),
      summary: "記憶體穩定在 ~55%,本服務本身無記憶體問題。",
    },
  ],
  "bank-gateway": [
    {
      service: "bank-gateway",
      metric: "latency_p99_ms",
      unit: "ms",
      points: pts([
        ["2026-05-19T16:00:00Z", 90],
        ["2026-05-19T16:12:00Z", 95],
        ["2026-05-19T16:16:00Z", 4800],
        ["2026-05-19T16:22:00Z", 5000],
      ]),
      summary: "p99 在 16:12 部署 v3.4.0 後急遽惡化至 ~5s。",
    },
  ],
};

// ──────────────────────────── 部署 ────────────────────────────

const DEPLOYS: Record<string, Deploy[]> = {
  "checkout-api": [
    {
      service: "checkout-api",
      version: "v2.8.0",
      deployedAt: "2026-05-19T13:50:00Z",
      deployedBy: "ci-bot",
      commit: "a1b2c3d",
      repo: "shop/checkout-api",
      pullRequest: 482,
      note: "Add in-memory cart cache for faster checkout",
    },
    {
      service: "checkout-api",
      version: "v2.7.3",
      deployedAt: "2026-05-12T09:10:00Z",
      deployedBy: "ci-bot",
      commit: "9f8e7d6",
      repo: "shop/checkout-api",
      pullRequest: 471,
      note: "Bump dependencies",
    },
  ],
  "payments-api": [
    {
      service: "payments-api",
      version: "v4.1.2",
      deployedAt: "2026-05-15T11:00:00Z",
      deployedBy: "ci-bot",
      commit: "5d4c3b2",
      repo: "shop/payments-api",
      pullRequest: 310,
      note: "Add idempotency keys to payment requests",
    },
  ],
  "bank-gateway": [
    {
      service: "bank-gateway",
      version: "v3.4.0",
      deployedAt: "2026-05-19T16:12:00Z",
      deployedBy: "ci-bot",
      commit: "c0ffee1",
      repo: "shop/bank-gateway",
      pullRequest: 219,
      note: "Tune HTTP connection pool sizing",
    },
    {
      service: "bank-gateway",
      version: "v3.3.9",
      deployedAt: "2026-05-10T08:30:00Z",
      deployedBy: "ci-bot",
      commit: "b00b00b",
      repo: "shop/bank-gateway",
      pullRequest: 210,
      note: "Logging improvements",
    },
  ],
};

// ──────────────────────────── Pull Requests ────────────────────────────

const PULL_REQUESTS: Record<string, PullRequest> = {
  "shop/checkout-api#482": {
    repo: "shop/checkout-api",
    number: 482,
    title: "Add in-memory cart cache for faster checkout",
    author: "alice",
    mergedAt: "2026-05-19T13:48:00Z",
    changedFiles: [
      "src/main/java/com/shop/checkout/cart/InMemoryCartCache.java",
      "src/main/java/com/shop/checkout/cart/CartService.java",
    ],
    description:
      "為了減少 Redis 往返,新增一個 process 內的購物車快取,以 sessionId 為 key。TODO: GA 前補上 eviction 機制。",
    diffSummary:
      "新增 `static HashMap<String, Cart> CACHE`;put() 只增不刪 —— 沒有任何 eviction、TTL 或大小上限。每個 session 的 cart 會永久累積在 heap,屬於典型的記憶體洩漏。",
  },
  "shop/bank-gateway#219": {
    repo: "shop/bank-gateway",
    number: 219,
    title: "Tune HTTP connection pool sizing",
    author: "bob",
    mergedAt: "2026-05-19T16:10:00Z",
    changedFiles: ["gateway/config/pool.yaml"],
    description: "為了省記憶體,調小對外銀行 API 的連線池上限。",
    diffSummary:
      "將對外銀行 API 連線池 maxConnections 由 200 調降為 8,connectionTimeout 仍為 30s。流量高峰時可用連線嚴重不足,請求排隊並逾時。",
  },
};

// ──────────────────────────── 歷史事故 ────────────────────────────

const PAST_INCIDENTS: PastIncident[] = [
  {
    id: "INC-0907",
    title: "checkout-api OOM,起因於 session 快取變更",
    summary:
      "一週前的部署引入未設上限的 session 快取,heap 緩慢耗盡導致 OOMKilled 與 crashloop,症狀與本次幾乎相同。",
    resolution:
      "立即回滾該部署止血;後續改用有大小上限(maxSize=10000)且帶 TTL 的 Caffeine LRU 快取後再上線。",
    tags: ["oom", "memory-leak", "cache", "checkout-api", "crashloop"],
    resolvedAt: "2026-03-02T10:40:00Z",
  },
  {
    id: "INC-0824",
    title: "payments-api 因下游 bank-gateway 逾時而延遲飆高",
    summary:
      "下游 bank-gateway 的連線池設定調整後,造成上游 payments-api 大量 SocketTimeoutException 與付款失敗。",
    resolution: "回滾 bank-gateway 的連線池設定;並為 payments-api 的下游呼叫加上更積極的熔斷。",
    tags: ["timeout", "downstream-dependency", "payments-api", "bank-gateway", "connection-pool"],
    resolvedAt: "2026-04-11T19:05:00Z",
  },
  {
    id: "INC-0788",
    title: "checkout-api 延遲升高,起因於 Redis 容量不足",
    summary: "Redis 節點記憶體不足觸發 eviction,checkout-api 快取命中率驟降導致延遲上升。",
    resolution: "擴充 Redis 節點記憶體並調整 maxmemory-policy。",
    tags: ["latency", "redis", "checkout-api", "cache"],
    resolvedAt: "2026-01-20T08:15:00Z",
  },
];

// ──────────────────────── 後端實作 ────────────────────────

/** 將字串切成小寫英數 token。 */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export const mockBackend: OncallBackend = {
  kind: "mock",

  async getIncident(id) {
    return INCIDENTS[id] ?? null;
  },

  async listRecentAlerts(service) {
    return ALERTS[service] ?? [];
  },

  async queryLogs(service, query) {
    const all = LOGS[service] ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    const matched = all.filter((entry) =>
      `${entry.level} ${entry.message}`.toLowerCase().includes(q),
    );
    // 找不到精確匹配時,回傳該服務全部日誌,讓 agent 仍有資料可推理。
    return matched.length > 0 ? matched : all;
  },

  async queryMetrics(service, metric) {
    const all = METRICS[service] ?? [];
    const q = metric.trim().toLowerCase();
    if (!q) return all;
    const matched = all.filter((series) => series.metric.toLowerCase().includes(q));
    return matched.length > 0 ? matched : all;
  },

  async listRecentDeploys(service) {
    return DEPLOYS[service] ?? [];
  },

  async getPullRequest(repo, prNumber) {
    return PULL_REQUESTS[`${repo}#${prNumber}`] ?? null;
  },

  async searchPastIncidents(query) {
    const queryTokens = new Set(tokenize(query));
    return PAST_INCIDENTS.map((incident) => {
      const docTokens = tokenize(
        `${incident.title} ${incident.summary} ${incident.tags.join(" ")}`,
      );
      let score = 0;
      for (const token of docTokens) {
        if (queryTokens.has(token)) score += 1;
      }
      return { incident, score };
    })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((row) => row.incident);
  },
};
