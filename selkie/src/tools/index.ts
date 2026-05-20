/**
 * 工具匯總 —— 匯出所有唯讀調查工具。
 *
 * 全部為「唯讀」:只查詢,不改動任何基礎設施(符合 v1 的自主程度設定)。
 */
import { getIncident, listRecentAlerts } from "./incidents.js";
import { queryLogs, queryMetrics } from "./observability.js";
import { listRecentDeploys, getPullRequest } from "./deploys.js";
import { searchRunbooks, searchPastIncidents } from "./knowledge.js";

export { getIncident, listRecentAlerts } from "./incidents.js";
export { queryLogs, queryMetrics } from "./observability.js";
export { listRecentDeploys, getPullRequest } from "./deploys.js";
export { searchRunbooks, searchPastIncidents } from "./knowledge.js";

/** 主 agent 可用的完整工具集。 */
export const allTools = [
  getIncident,
  listRecentAlerts,
  queryLogs,
  queryMetrics,
  listRecentDeploys,
  getPullRequest,
  searchRunbooks,
  searchPastIncidents,
];
