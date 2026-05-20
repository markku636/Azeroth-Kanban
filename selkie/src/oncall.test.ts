/**
 * 單元測試 —— 驗證 mock 後端、知識庫、工具與 schema。
 * 這些測試「不需」GCP 憑證,純粹測本地邏輯。
 *
 * 執行: npm test
 */
import { describe, expect, it } from "vitest";
import { searchRunbooks } from "./knowledgeBase.js";
import { TriageReportSchema } from "./schemas.js";
import { mockBackend } from "./tools/backends/mock.js";
import { getIncident, listRecentDeploys, queryLogs, searchRunbooks as searchRunbooksTool } from "./tools/index.js";

describe("mock 後端 — 事故與告警", () => {
  it("取得 INC-1024,服務為 checkout-api", async () => {
    const incident = await mockBackend.getIncident("INC-1024");
    expect(incident).not.toBeNull();
    expect(incident?.service).toBe("checkout-api");
  });

  it("不存在的事故回傳 null", async () => {
    expect(await mockBackend.getIncident("INC-9999")).toBeNull();
  });

  it("checkout-api 有多筆相關告警", async () => {
    const alerts = await mockBackend.listRecentAlerts("checkout-api", 120);
    expect(alerts.length).toBeGreaterThan(1);
  });
});

describe("mock 後端 — 日誌與 metrics", () => {
  it("checkout-api 日誌含 OutOfMemoryError", async () => {
    const logs = await mockBackend.queryLogs("checkout-api", "OutOfMemoryError", 120);
    expect(logs.some((entry) => entry.message.includes("OutOfMemoryError"))).toBe(true);
  });

  it("payments-api 日誌指向下游 bank-gateway", async () => {
    const logs = await mockBackend.queryLogs("payments-api", "", 120);
    expect(logs.some((entry) => entry.message.includes("bank-gateway"))).toBe(true);
  });

  it("checkout-api 記憶體 metric 單調攀升至接近上限", async () => {
    const series = await mockBackend.queryMetrics("checkout-api", "memory", 120);
    expect(series.length).toBeGreaterThan(0);
    const points = series[0].points;
    expect(points[0].value).toBeLessThan(points[points.length - 1].value);
    expect(points[points.length - 1].value).toBeGreaterThan(90);
  });
});

describe("mock 後端 — 部署與 PR", () => {
  it("checkout-api 近期部署含 v2.8.0 / PR #482", async () => {
    const deploys = await mockBackend.listRecentDeploys("checkout-api", 1440);
    expect(deploys.some((d) => d.version === "v2.8.0" && d.pullRequest === 482)).toBe(true);
  });

  it("PR shop/checkout-api#482 的 diff 點出缺少 eviction", async () => {
    const pr = await mockBackend.getPullRequest("shop/checkout-api", 482);
    expect(pr?.diffSummary).toContain("eviction");
  });

  it("bank-gateway 近期部署含 v3.4.0 / PR #219", async () => {
    const deploys = await mockBackend.listRecentDeploys("bank-gateway", 1440);
    expect(deploys.some((d) => d.version === "v3.4.0" && d.pullRequest === 219)).toBe(true);
  });

  it("搜尋歷史事故可找到相似的 OOM 前例 INC-0907", async () => {
    const past = await mockBackend.searchPastIncidents("oom memory-leak cache crashloop");
    expect(past.some((p) => p.id === "INC-0907")).toBe(true);
  });
});

describe("知識庫 — runbook 搜尋", () => {
  it("以 OOMKilled 關鍵字找到 oom-killed runbook", async () => {
    const hits = await searchRunbooks("OOMKilled OutOfMemoryError crashloop");
    expect(hits.some((h) => h.path.includes("oom-killed"))).toBe(true);
  });

  it("以 SocketTimeoutException 關鍵字找到 downstream runbook", async () => {
    const hits = await searchRunbooks("SocketTimeoutException downstream timeout");
    expect(hits.some((h) => h.path.includes("downstream-dependency-timeout"))).toBe(true);
  });
});

describe("工具包裝 — 回傳字串", () => {
  it("get_incident 回傳含服務名的字串", async () => {
    const out = await getIncident.invoke({ incidentId: "INC-1024" });
    expect(typeof out).toBe("string");
    expect(out).toContain("checkout-api");
  });

  it("query_logs 對 checkout-api 回傳含 OOM 的日誌", async () => {
    const out = await queryLogs.invoke({ service: "checkout-api", query: "OutOfMemoryError" });
    expect(out).toContain("OutOfMemoryError");
  });

  it("list_recent_deploys 對 checkout-api 回傳含 v2.8.0 的字串", async () => {
    const out = await listRecentDeploys.invoke({ service: "checkout-api" });
    expect(out).toContain("v2.8.0");
  });

  it("search_runbooks 對 OOM 症狀回傳含 runbook 內容的字串", async () => {
    const out = await searchRunbooksTool.invoke({ query: "OOMKilled crashloop" });
    expect(out).toContain("OOMKilled");
  });
});

describe("TriageReportSchema(Gemini-safe)", () => {
  it("接受合法的 triage 報告物件", () => {
    const result = TriageReportSchema.safeParse({
      incidentId: "INC-1024",
      severity: "SEV1",
      severityRationale: "核心結帳功能 crashloop",
      summary: "checkout-api OOM",
      suspectedCause: "PR #482 未設上限的快取",
      confidence: "high",
      evidence: ["query_logs: OutOfMemoryError @ 14:02:33"],
      correlatedDeploys: ["v2.8.0 (PR #482)"],
      recommendedActions: ["回滾至 v2.7.3"],
      runbookLinks: ["knowledge/runbooks/oom-killed.md"],
      needsHumanEscalation: true,
    });
    expect(result.success).toBe(true);
  });

  it("拒絕非法的 severity 值", () => {
    const result = TriageReportSchema.safeParse({ incidentId: "x", severity: "SEV9" });
    expect(result.success).toBe(false);
  });
});
