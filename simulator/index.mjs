/**
 * Selkie 混沌模擬器
 *
 * 1. loadgen:持續對每個 sim 服務的 /api/work 發流量(產生基準日誌)。
 * 2. 混沌循環:輪流對各服務注入故障 → 等真實錯誤日誌進 ES → 發告警到 Selkie webhook
 *    → 持續一段時間 → 復原。
 *
 * 服務 ↔ 故障模式 對齊 selkie 的 env-metadata(讓 deploy-correlator 能找到合理肇因)。
 */

const ADMIN_URL = process.env.ADMIN_URL ?? "http://admin:3000";
const WEBHOOK_SECRET = process.env.SELKIE_WEBHOOK_SECRET ?? "selkie-dev-secret";
const LOAD_INTERVAL_MS = Number(process.env.LOAD_INTERVAL_MS ?? 3000);
const STARTUP_DELAY_MS = Number(process.env.STARTUP_DELAY_MS ?? 90000);
const ALERT_DELAY_MS = Number(process.env.ALERT_DELAY_MS ?? 45000);
const FAILURE_DURATION_MS = Number(process.env.FAILURE_DURATION_MS ?? 150000);
const GAP_MS = Number(process.env.GAP_MS ?? 60000);

const SERVICES = [
  {
    name: "checkout-api",
    url: "http://sim-checkout:3000",
    mode: "memory-leak",
    severity: "high",
    title: "checkout-api 記憶體用量持續攀升,疑似記憶體洩漏",
  },
  {
    name: "payments-api",
    url: "http://sim-payments:3000",
    mode: "error-5xx",
    severity: "critical",
    title: "payments-api HTTP 5xx 錯誤率飆升",
  },
  {
    name: "cart-service",
    url: "http://sim-cart:3000",
    mode: "slow",
    severity: "high",
    title: "cart-service 回應延遲飆升,p99 超過 5 秒",
  },
  {
    name: "order-service",
    url: "http://sim-orders:3000",
    mode: "cpu-spin",
    severity: "high",
    title: "order-service CPU 飽和,event loop 阻塞",
  },
  {
    name: "inventory-service",
    url: "http://sim-inventory:3000",
    mode: "crash",
    severity: "critical",
    title: "inventory-service 反覆重啟,進入 crashloop",
  },
];

function log(msg) {
  console.log(`[simulator] ${new Date().toISOString()} ${msg}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeFetch(url, opts) {
  try {
    return await fetch(url, opts);
  } catch {
    return null;
  }
}

/** loadgen:每隔一段時間對每個服務發幾個請求。 */
function startLoadGenerator() {
  setInterval(() => {
    for (const svc of SERVICES) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        void safeFetch(`${svc.url}/api/work`);
      }
    }
  }, LOAD_INTERVAL_MS);
  log("load generator started");
}

async function setChaos(svc, mode) {
  await safeFetch(`${svc.url}/api/chaos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

async function postAlert(svc) {
  const res = await safeFetch(`${ADMIN_URL}/api/v1/webhooks/alerts/generic`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-selkie-webhook-secret": WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      title: svc.title,
      service: svc.name,
      severity: svc.severity,
      source: "sim-monitor",
      description: `監控偵測到 ${svc.name} 異常 —— ${svc.title}。`,
    }),
  });
  log(`alert posted for ${svc.name} → ${res ? `HTTP ${res.status}` : "no response"}`);
}

/** 混沌循環:輪流注入故障 → 等日誌累積 → 發告警 → 持續 → 復原。 */
async function chaosLoop() {
  log(`waiting ${Math.round(STARTUP_DELAY_MS / 1000)}s for services + ELK to warm up...`);
  await sleep(STARTUP_DELAY_MS);

  let i = 0;
  for (;;) {
    const svc = SERVICES[i % SERVICES.length];
    i += 1;

    log(`injecting "${svc.mode}" on ${svc.name}`);
    await setChaos(svc, svc.mode);

    await sleep(ALERT_DELAY_MS); // 等真實錯誤日誌進入 Elasticsearch
    await postAlert(svc); // 發告警 → Selkie 自動建事故並 triage

    await sleep(FAILURE_DURATION_MS);

    log(`healing ${svc.name}`);
    await setChaos(svc, "none");

    await sleep(GAP_MS);
  }
}

log("starting — load generator + chaos controller");
startLoadGenerator();
chaosLoop();
