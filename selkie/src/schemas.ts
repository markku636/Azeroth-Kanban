/**
 * 領域型別與結構化輸出 schema。
 *
 * - 領域型別(Incident、LogEntry...)為內部資料形狀,用 TS interface。
 * - TriageReportSchema 為 Zod schema,供 eval 驗證與(選用的)結構化輸出使用。
 *
 * ⚠️ Gemini / Vertex function-calling 的 Zod schema 限制(僅適用於「工具參數」schema):
 *    - 不支援 z.union() / z.discriminatedUnion() → 改用扁平物件 + optional 欄位
 *    - 不支援 .nullish() → 改用 .optional()
 *    - .positive() 會被轉為 .min(0.01) → 直接用 .min()
 *    - z.enum([...]) 可正常使用
 */
import { z } from "zod";

// ──────────────────────────── 領域型別 ────────────────────────────

/** 正規化後的事故 / 告警輸入(各告警來源都會轉成此形狀)。 */
export interface Incident {
  id: string;
  title: string;
  /** 受影響的服務名稱,例如 checkout-api */
  service: string;
  /** 來源:pagerduty | datadog | alertmanager | manual ... */
  source: string;
  /** 狀態:triggered | acknowledged | resolved */
  status: string;
  /** 觸發時間(ISO 8601) */
  triggeredAt: string;
  description: string;
  /** 既有的初步嚴重度(若告警來源有提供);agent 仍會自行評估 */
  severityHint?: string;
  links?: string[];
}

/** 告警事件。 */
export interface Alert {
  name: string;
  service: string;
  status: string;
  triggeredAt: string;
  detail: string;
}

/** 單筆日誌。 */
export interface LogEntry {
  timestamp: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  service: string;
  message: string;
}

/** 一段 metric 時間序列。 */
export interface MetricSeries {
  service: string;
  metric: string;
  unit: string;
  points: { timestamp: string; value: number }[];
  /** 對該序列的人類可讀摘要(mock 後端預先算好,真實後端可省略) */
  summary: string;
}

/** 一次部署。 */
export interface Deploy {
  service: string;
  version: string;
  deployedAt: string;
  deployedBy: string;
  commit: string;
  repo: string;
  pullRequest?: number;
  note: string;
}

/** Pull Request 詳情。 */
export interface PullRequest {
  repo: string;
  number: number;
  title: string;
  author: string;
  mergedAt: string;
  changedFiles: string[];
  description: string;
  /** diff 重點摘要 */
  diffSummary: string;
}

/** runbook 搜尋命中(含完整內容,runbook 檔案通常很短)。 */
export interface RunbookHit {
  title: string;
  path: string;
  score: number;
  content: string;
}

/** 歷史相似事故。 */
export interface PastIncident {
  id: string;
  title: string;
  summary: string;
  resolution: string;
  tags: string[];
  resolvedAt: string;
}

// ──────────────────────── 結構化 Triage 報告 ────────────────────────

export const SeverityEnum = z.enum(["SEV1", "SEV2", "SEV3", "SEV4"]);
export type Severity = z.infer<typeof SeverityEnum>;

export const ConfidenceEnum = z.enum(["high", "medium", "low"]);

/**
 * Triage 報告結構。可作為 createDeepAgent 的 responseFormat(選用),
 * 或用於 eval 驗證 agent 輸出。Schema 刻意保持扁平、無 union,以相容 Gemini。
 */
export const TriageReportSchema = z.object({
  incidentId: z.string().describe("事故 ID"),
  severity: SeverityEnum.describe("評定的嚴重度"),
  severityRationale: z.string().describe("為何評為此嚴重度,引用 severity-guide"),
  summary: z.string().describe("一段話的事故摘要"),
  suspectedCause: z.string().describe("最可能的根因,需有證據支持"),
  confidence: ConfidenceEnum.describe("對根因判斷的信心度"),
  evidence: z.array(z.string()).describe("支持結論的證據,每條都註明來源工具"),
  correlatedDeploys: z.array(z.string()).describe("時間上相關的部署 / PR"),
  recommendedActions: z.array(z.string()).describe("建議的處置步驟(依優先序)"),
  runbookLinks: z.array(z.string()).describe("相關 runbook 路徑"),
  needsHumanEscalation: z.boolean().describe("是否需要升級給人類 / 其他團隊"),
});

export type TriageReport = z.infer<typeof TriageReportSchema>;
