/**
 * 集中管理環境變數設定。
 *
 * 注意:此檔在 import 時「不會」throw。缺值的驗證交由 assertXxx() 在實際需要時呼叫,
 * 這樣只測試工具的 `npm test` 不會因為缺少 GCP 設定而失敗。
 */

export type ToolBackendKind = "mock" | "real";

export const config = {
  /** Vertex AI / GCP 設定 */
  gcp: {
    project: process.env.GOOGLE_CLOUD_PROJECT ?? "",
    location: process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
  },
  /** Gemini 模型(Vertex AI) */
  model: {
    /** 主 agent(orchestrator)用 */
    main: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    /** subagent 用的較便宜模型 */
    fast: process.env.GEMINI_MODEL_FAST ?? "gemini-2.5-flash",
    /** 每個模型的並發呼叫上限;deep agent 多 subagent 易觸發 429,預設序列化(1) */
    maxConcurrency: Math.max(1, Number(process.env.GEMINI_MAX_CONCURRENCY ?? 1)),
  },
  /** 工具後端:mock(內建假資料)或 real(真實整合,Phase 7) */
  toolBackend: ((process.env.TOOL_BACKEND ?? "mock").toLowerCase() === "real"
    ? "real"
    : "mock") as ToolBackendKind,
  /** Slack bot 設定(Phase 5) */
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN ?? "",
    appToken: process.env.SLACK_APP_TOKEN ?? "",
    signingSecret: process.env.SLACK_SIGNING_SECRET ?? "",
    /** webhook 自動 triage 後,報告要貼回的頻道 */
    incidentChannel: process.env.SLACK_INCIDENT_CHANNEL ?? "",
  },
  /** 告警 webhook 伺服器埠號(Phase 6) */
  webhookPort: Number(process.env.PORT ?? 3000),
} as const;

/** 確認 Vertex AI 必要設定;在啟動需要 LLM 的流程前呼叫。 */
export function assertVertexConfig(): void {
  if (!config.gcp.project) {
    throw new Error(
      "缺少 GOOGLE_CLOUD_PROJECT 環境變數。\n" +
        "請在 .env 填入 GCP 設定,且該專案需已啟用 Vertex AI API 並有可用配額。\n" +
        "憑證:把 service account JSON 放專案根目錄、命名 service-account.json。",
    );
  }
}

/** 確認 Slack bot 必要設定(Phase 5)。 */
export function assertSlackConfig(): void {
  const missing = (
    [
      ["SLACK_BOT_TOKEN", config.slack.botToken],
      ["SLACK_APP_TOKEN", config.slack.appToken],
      ["SLACK_SIGNING_SECRET", config.slack.signingSecret],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`缺少 Slack 環境變數: ${missing.join(", ")}`);
  }
}
