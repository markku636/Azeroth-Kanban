/**
 * Subagent 定義 —— 四個專責調查 agent,各有獨立 context、專屬提示與工具子集。
 *
 * deepagents 會把這些註冊到主 agent 的 task 工具;主 agent 以 subagent 名稱委派任務。
 * 每個 subagent 預設用較便宜的 Gemini Flash(可由 GEMINI_MODEL_FAST 調整)。
 */
import type { SubAgent } from "deepagents";
import { makeFastModel } from "../model.js";
import {
  DEPLOY_CORRELATOR_PROMPT,
  LOG_INVESTIGATOR_PROMPT,
  METRICS_ANALYST_PROMPT,
  RUNBOOK_RESEARCHER_PROMPT,
} from "../prompts.js";
import {
  getIncident,
  getPullRequest,
  listRecentAlerts,
  listRecentDeploys,
  queryLogs,
  queryMetrics,
  searchPastIncidents,
  searchRunbooks,
} from "../tools/index.js";

export const subagents: SubAgent[] = [
  {
    name: "log-investigator",
    description:
      "深入某服務的日誌,找出錯誤特徵、stack trace、最早的失敗點與失敗時間軸。" +
      "需要從日誌找線索時委派給它。",
    systemPrompt: LOG_INVESTIGATOR_PROMPT,
    tools: [getIncident, queryLogs, listRecentAlerts],
    model: makeFastModel(),
  },
  {
    name: "metrics-analyst",
    description:
      "分析某服務的 metrics,找出異常 metric、異常起始時間與型態、飽和的資源。" +
      "需要量化證據與異常起始時間時委派給它。",
    systemPrompt: METRICS_ANALYST_PROMPT,
    tools: [getIncident, queryMetrics],
    model: makeFastModel(),
  },
  {
    name: "deploy-correlator",
    description:
      "比對事故時間與近期部署 / PR 變更(含下游服務),鎖定最可能的肇因變更。" +
      "需要釐清「是哪個變更造成的」時委派給它。",
    systemPrompt: DEPLOY_CORRELATOR_PROMPT,
    tools: [getIncident, listRecentDeploys, getPullRequest],
    model: makeFastModel(),
  },
  {
    name: "runbook-researcher",
    description:
      "搜尋 runbook 與歷史相似事故,找出標準診斷步驟與已驗證的修復方式。" +
      "需要處置建議與前例時委派給它。",
    systemPrompt: RUNBOOK_RESEARCHER_PROMPT,
    tools: [getIncident, searchRunbooks, searchPastIncidents],
    model: makeFastModel(),
  },
];
