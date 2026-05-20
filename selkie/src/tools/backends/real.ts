/**
 * 真實後端 —— logs / metrics 查真實的 Elasticsearch(sim-service 經 filebeat 送進),
 * deploys / PR / 歷史事故用 env-metadata 的 curated 資料。
 * 由 TOOL_BACKEND=real 啟用。
 *
 * 任何 ES 查詢失敗(連不上 / 索引未建立)都會被捕捉並回傳空結果,
 * 讓 agent 得到「查無資料」而非整個崩潰。
 */
import type { LogEntry, MetricSeries } from "../../schemas.js";
import { DEPLOYS, PAST_INCIDENTS, PULL_REQUESTS } from "./env-metadata.js";
import { recallIncident } from "./incident-registry.js";
import type { OncallBackend } from "./types.js";

const ES_URL = (process.env.ELASTICSEARCH_URL ?? "http://elasticsearch:9200").replace(/\/+$/, "");
const LOG_INDEX = "selkie-logs-*";

/** 對 selkie-logs-* 執行一次 _search,回傳原始 JSON。 */
async function esSearch(body: unknown): Promise<any> {
  const res = await fetch(`${ES_URL}/${LOG_INDEX}/_search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Elasticsearch ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

function sinceIso(windowMinutes: number): string {
  return new Date(Date.now() - windowMinutes * 60_000).toISOString();
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

const VALID_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"];
function asLevel(value: unknown): LogEntry["level"] {
  return typeof value === "string" && VALID_LEVELS.includes(value)
    ? (value as LogEntry["level"])
    : "INFO";
}

export const realBackend: OncallBackend = {
  kind: "real",

  // 真實後端無事故儲存;改由行程內登錄表回傳「當前 triage 的事故」(runTriage 觸發時已登錄)。
  async getIncident(id) {
    return recallIncident(id);
  },

  async listRecentAlerts(service, windowMinutes) {
    try {
      const r = await esSearch({
        size: 0,
        query: {
          bool: {
            must: [
              { term: { "service.keyword": service } },
              { term: { "level.keyword": "ERROR" } },
              { range: { "@timestamp": { gte: sinceIso(windowMinutes) } } },
            ],
          },
        },
        aggs: {
          kinds: {
            terms: { field: "msg.keyword", size: 6 },
            aggs: { first: { min: { field: "@timestamp" } } },
          },
        },
      });
      const buckets: any[] = r?.aggregations?.kinds?.buckets ?? [];
      return buckets.map((b) => ({
        name: `${service}:${String(b.key)}`,
        service,
        status: "triggered",
        triggeredAt: String(b.first?.value_as_string ?? ""),
        detail: `近 ${windowMinutes} 分鐘內出現 ${b.doc_count} 次此錯誤`,
      }));
    } catch (e) {
      console.warn("[realBackend.listRecentAlerts]", e);
      return [];
    }
  },

  async queryLogs(service, query, windowMinutes) {
    try {
      const must: unknown[] = [
        { term: { "service.keyword": service } },
        { range: { "@timestamp": { gte: sinceIso(windowMinutes) } } },
      ];
      if (query && query.trim()) {
        must.push({ multi_match: { query: query.trim(), fields: ["msg", "message", "level"] } });
      }
      const r = await esSearch({
        size: 100,
        sort: [{ "@timestamp": "asc" }],
        query: { bool: { must } },
      });
      const hits: any[] = r?.hits?.hits ?? [];
      return hits.map((h) => {
        const s = h._source ?? {};
        return {
          timestamp: String(s["@timestamp"] ?? ""),
          level: asLevel(s.level),
          service: String(s.service ?? service),
          message: String(s.msg ?? s.message ?? ""),
        };
      });
    } catch (e) {
      console.warn("[realBackend.queryLogs]", e);
      return [];
    }
  },

  async queryMetrics(service, metric, windowMinutes) {
    try {
      const r = await esSearch({
        size: 0,
        query: {
          bool: {
            must: [
              { term: { "service.keyword": service } },
              { range: { "@timestamp": { gte: sinceIso(windowMinutes) } } },
            ],
          },
        },
        aggs: {
          timeline: {
            date_histogram: { field: "@timestamp", fixed_interval: "1m" },
            aggs: {
              errors: { filter: { range: { status: { gte: 500 } } } },
              p99: { percentiles: { field: "durationMs", percents: [99] } },
            },
          },
        },
      });
      const buckets: any[] = r?.aggregations?.timeline?.buckets ?? [];
      const errorRate: MetricSeries = {
        service,
        metric: "error_rate_pct",
        unit: "% of requests",
        points: [],
        summary: `近 ${windowMinutes} 分鐘錯誤率,由真實日誌的 HTTP status 計算。`,
      };
      const latency: MetricSeries = {
        service,
        metric: "latency_p99_ms",
        unit: "ms",
        points: [],
        summary: `近 ${windowMinutes} 分鐘 p99 延遲,由真實日誌的 durationMs 計算。`,
      };
      for (const b of buckets) {
        const ts = String(b.key_as_string ?? "");
        const total: number = b.doc_count ?? 0;
        const errs: number = b.errors?.doc_count ?? 0;
        errorRate.points.push({
          timestamp: ts,
          value: total > 0 ? Math.round((errs / total) * 1000) / 10 : 0,
        });
        const p99v = b.p99?.values?.["99.0"];
        latency.points.push({
          timestamp: ts,
          value: typeof p99v === "number" && Number.isFinite(p99v) ? Math.round(p99v) : 0,
        });
      }
      const all = [errorRate, latency];
      const q = (metric ?? "").trim().toLowerCase();
      if (!q) return all;
      const matched = all.filter((m) => m.metric.toLowerCase().includes(q));
      return matched.length > 0 ? matched : all;
    } catch (e) {
      console.warn("[realBackend.queryMetrics]", e);
      return [];
    }
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
      let score = 0;
      for (const token of tokenize(
        `${incident.title} ${incident.summary} ${incident.tags.join(" ")}`,
      )) {
        if (queryTokens.has(token)) score += 1;
      }
      return { incident, score };
    })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((row) => row.incident);
  },
};
