/**
 * 模擬環境的「靜態 metadata」—— 部署、PR、歷史事故。
 *
 * 即時訊號(logs / metrics)由 real 後端查真實 Elasticsearch;
 * 這裡的部署 / PR / 歷史事故則是 curated 資料,刻意與 simulator 對各服務注入的
 * 故障模式對齊,讓 deploy-correlator subagent 能找到合理的肇因變更。
 *
 * 服務 ↔ 故障模式 ↔ 肇因部署 對齊:
 *   checkout-api      memory-leak  → PR #482 未設上限的快取
 *   payments-api      error-5xx    → PR #310 付款驗證重構引入未處理路徑
 *   cart-service      slow         → PR #205 加入同步的下游庫存檢查
 *   order-service     cpu-spin     → PR #612 新訂單撮合演算法(O(n^2))
 *   inventory-service crash        → PR #88  升級 inventory-sdk v3 啟動即拋錯
 */
import type { Deploy, PastIncident, PullRequest } from "../../schemas.js";

/** 相對「現在」的 ISO 時間(分鐘前)。 */
function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

export const DEPLOYS: Record<string, Deploy[]> = {
  "checkout-api": [
    {
      service: "checkout-api",
      version: "v3.2.0",
      deployedAt: minutesAgo(45),
      deployedBy: "ci-bot",
      commit: "a1b2c3d",
      repo: "shop/checkout-api",
      pullRequest: 482,
      note: "Add in-memory cart cache for faster checkout",
    },
    {
      service: "checkout-api",
      version: "v3.1.4",
      deployedAt: minutesAgo(6 * 24 * 60),
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
      version: "v4.1.0",
      deployedAt: minutesAgo(38),
      deployedBy: "ci-bot",
      commit: "c0ffee1",
      repo: "shop/payments-api",
      pullRequest: 310,
      note: "Refactor payment validation",
    },
    {
      service: "payments-api",
      version: "v4.0.7",
      deployedAt: minutesAgo(9 * 24 * 60),
      deployedBy: "ci-bot",
      commit: "5d4c3b2",
      repo: "shop/payments-api",
      pullRequest: 297,
      note: "Add idempotency keys",
    },
  ],
  "cart-service": [
    {
      service: "cart-service",
      version: "v2.5.0",
      deployedAt: minutesAgo(52),
      deployedBy: "ci-bot",
      commit: "b00b1e5",
      repo: "shop/cart-service",
      pullRequest: 205,
      note: "Add synchronous inventory check on add-to-cart",
    },
    {
      service: "cart-service",
      version: "v2.4.9",
      deployedAt: minutesAgo(11 * 24 * 60),
      deployedBy: "ci-bot",
      commit: "7a6b5c4",
      repo: "shop/cart-service",
      pullRequest: 198,
      note: "Logging improvements",
    },
  ],
  "order-service": [
    {
      service: "order-service",
      version: "v5.0.0",
      deployedAt: minutesAgo(33),
      deployedBy: "ci-bot",
      commit: "d3adb33",
      repo: "shop/order-service",
      pullRequest: 612,
      note: "New order-matching algorithm",
    },
    {
      service: "order-service",
      version: "v4.9.2",
      deployedAt: minutesAgo(8 * 24 * 60),
      deployedBy: "ci-bot",
      commit: "1234abc",
      repo: "shop/order-service",
      pullRequest: 601,
      note: "Tweak retry backoff",
    },
  ],
  "inventory-service": [
    {
      service: "inventory-service",
      version: "v1.9.0",
      deployedAt: minutesAgo(41),
      deployedBy: "ci-bot",
      commit: "feed1234",
      repo: "shop/inventory-service",
      pullRequest: 88,
      note: "Upgrade to inventory-sdk v3",
    },
    {
      service: "inventory-service",
      version: "v1.8.6",
      deployedAt: minutesAgo(13 * 24 * 60),
      deployedBy: "ci-bot",
      commit: "cafe5678",
      repo: "shop/inventory-service",
      pullRequest: 80,
      note: "Add stock-level metrics",
    },
  ],
};

export const PULL_REQUESTS: Record<string, PullRequest> = {
  "shop/checkout-api#482": {
    repo: "shop/checkout-api",
    number: 482,
    title: "Add in-memory cart cache for faster checkout",
    author: "alice",
    mergedAt: minutesAgo(50),
    changedFiles: ["src/cart/InMemoryCartCache.ts", "src/cart/CartService.ts"],
    description: "以 sessionId 為 key 在 process 內快取購物車,減少 Redis 往返。TODO: GA 前補 eviction。",
    diffSummary:
      "新增 `const CACHE = new Map<string, Cart>()`;put() 只增不刪 —— 無 eviction、無 TTL、無大小上限。每個 session 的 cart 會永久累積在 heap,屬典型記憶體洩漏。",
  },
  "shop/payments-api#310": {
    repo: "shop/payments-api",
    number: 310,
    title: "Refactor payment validation",
    author: "bob",
    mergedAt: minutesAgo(43),
    changedFiles: ["src/payment/validate.ts", "src/payment/handler.ts"],
    description: "把付款驗證抽成獨立模組。",
    diffSummary:
      "重構後 handler 對 `validate()` 回傳的錯誤分支未接住 —— 特定輸入會走到未處理路徑並拋出未捕捉例外,導致 HTTP 500。缺少 try/catch 與預設分支。",
  },
  "shop/cart-service#205": {
    repo: "shop/cart-service",
    number: 205,
    title: "Add synchronous inventory check on add-to-cart",
    author: "carol",
    mergedAt: minutesAgo(58),
    changedFiles: ["src/cart/addToCart.ts"],
    description: "加入購物車時即時檢查庫存。",
    diffSummary:
      "addToCart() 內以「同步阻塞」方式呼叫 inventory-service 並等待回應,且未設逾時。下游一慢,本服務的每個請求都被拖住,p99 延遲飆升。",
  },
  "shop/order-service#612": {
    repo: "shop/order-service",
    number: 612,
    title: "New order-matching algorithm",
    author: "dave",
    mergedAt: minutesAgo(40),
    changedFiles: ["src/order/matchOrders.ts"],
    description: "改寫訂單撮合邏輯。",
    diffSummary:
      "新撮合演算法用巢狀迴圈兩兩比對訂單(O(n^2)),訂單量一大就把 CPU / event loop 佔滿,造成請求堆積與延遲。",
  },
  "shop/inventory-service#88": {
    repo: "shop/inventory-service",
    number: 88,
    title: "Upgrade to inventory-sdk v3",
    author: "erin",
    mergedAt: minutesAgo(46),
    changedFiles: ["package.json", "src/sdk/init.ts"],
    description: "升級 inventory-sdk 至 v3。",
    diffSummary:
      "inventory-sdk v3 的初始化在缺少新設定項時會直接 throw;init.ts 未加防護,服務啟動即拋未捕捉例外 → 程序退出 → 容器反覆重啟(crashloop)。",
  },
};

export const PAST_INCIDENTS: PastIncident[] = [
  {
    id: "INC-0907",
    title: "checkout-api OOM,起因於未設上限的快取",
    summary: "一週前部署引入未設大小上限的快取,heap 緩慢耗盡導致 OOMKilled 與 crashloop。",
    resolution: "回滾該部署止血;後續改用帶 maxSize + TTL 的 LRU 快取。",
    tags: ["oom", "memory-leak", "cache", "checkout-api"],
    resolvedAt: minutesAgo(7 * 24 * 60),
  },
  {
    id: "INC-0824",
    title: "payments-api 5xx 飆升,起因於部署引入未處理錯誤路徑",
    summary: "付款相關重構後,特定輸入觸發未捕捉例外,造成大量 HTTP 500。",
    resolution: "回滾部署;補上 try/catch 與錯誤分支處理後重新上線。",
    tags: ["5xx", "error", "deploy", "payments-api", "exception"],
    resolvedAt: minutesAgo(20 * 24 * 60),
  },
  {
    id: "INC-0791",
    title: "cart-service 延遲飆高,起因於同步下游呼叫",
    summary: "新增的同步下游呼叫無逾時,下游一慢就拖垮上游所有請求。",
    resolution: "改為非同步 / 加逾時與熔斷。",
    tags: ["latency", "slow", "downstream", "cart-service", "timeout"],
    resolvedAt: minutesAgo(15 * 24 * 60),
  },
  {
    id: "INC-0756",
    title: "order-service CPU 飽和,起因於演算法變更",
    summary: "新演算法複雜度過高,訂單量上升後 CPU 佔滿、event loop 阻塞。",
    resolution: "回滾演算法;改用較低複雜度的實作。",
    tags: ["cpu", "saturation", "algorithm", "order-service", "deploy"],
    resolvedAt: minutesAgo(26 * 24 * 60),
  },
  {
    id: "INC-0712",
    title: "inventory-service crashloop,起因於相依套件升級",
    summary: "SDK 升級後初始化拋例外,服務啟動即崩潰、反覆重啟。",
    resolution: "回滾 SDK 版本;補上初始化防護後再升級。",
    tags: ["crash", "crashloop", "sdk", "inventory-service", "deploy", "startup"],
    resolvedAt: minutesAgo(30 * 24 * 60),
  },
];
