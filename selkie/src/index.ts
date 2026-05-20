/**
 * @azeroth/selkie —— oncall 事故調查 agent(LangChain Deep Agents + Gemini on Vertex AI)。
 *
 * 這是套件對外的公開介面;Next.js admin app 由此 import。
 * 注意:本套件為 Node-only(server 端),不可在 client component 中 import。
 */
export { runTriage, continueTriage } from "./triage.js";
export type { TriageResult, TriageOptions } from "./triage.js";

export { buildOncallAgent, getOncallAgent } from "./agent.js";
export { normalizeAlert } from "./alerts/normalize.js";
export { assertVertexConfig, config as selkieConfig } from "./config.js";

export type {
  Incident,
  Alert,
  LogEntry,
  MetricSeries,
  Deploy,
  PullRequest,
  TriageReport,
  Severity,
} from "./schemas.js";
