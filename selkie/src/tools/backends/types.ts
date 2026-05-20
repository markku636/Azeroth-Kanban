/**
 * 工具後端介面 —— 所有「對外部系統的唯讀查詢」都走這個介面。
 *
 * mock 後端(Phase 2)與真實後端(Phase 7,PagerDuty/Datadog/GitHub...)都實作此介面,
 * 以環境變數 TOOL_BACKEND 切換,agent 與工具層完全不需改動。
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

export interface OncallBackend {
  /** 後端種類標示(mock / real),供日誌與除錯用。 */
  readonly kind: string;

  /** 取得單一事故 / 告警的詳情。 */
  getIncident(id: string): Promise<Incident | null>;

  /** 列出某服務近期的相關告警。 */
  listRecentAlerts(service: string, windowMinutes: number): Promise<Alert[]>;

  /** 查詢某服務近期的日誌(query 為關鍵字或過濾條件)。 */
  queryLogs(service: string, query: string, windowMinutes: number): Promise<LogEntry[]>;

  /** 查詢某服務近期的 metric 時間序列(metric 為名稱關鍵字,如 memory / latency)。 */
  queryMetrics(service: string, metric: string, windowMinutes: number): Promise<MetricSeries[]>;

  /** 列出某服務近期的部署紀錄。 */
  listRecentDeploys(service: string, windowMinutes: number): Promise<Deploy[]>;

  /** 取得某 PR 的詳情(含 diff 摘要)。 */
  getPullRequest(repo: string, prNumber: number): Promise<PullRequest | null>;

  /** 搜尋歷史相似事故。 */
  searchPastIncidents(query: string): Promise<PastIncident[]>;
}
