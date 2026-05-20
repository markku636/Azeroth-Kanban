/**
 * Triage 核心 —— 跑一次完整事故調查的共用函式。
 *
 * CLI、Slack bot、webhook 三種入口都呼叫這裡,確保行為一致。
 * 輸入可以是事故 ID(agent 用 get_incident 取詳情)或完整 Incident 物件
 *(webhook 正規化告警後直接帶入,不依賴後端有該事故)。
 */
import type { FileData } from "deepagents";
import { getOncallAgent } from "./agent.js";
import type { Incident } from "./schemas.js";
import { rememberIncident } from "./tools/backends/incident-registry.js";

export interface TriageResult {
  incidentId: string;
  /** agent 最後一則訊息(精簡 triage 摘要) */
  finalText: string;
  /** 虛擬檔案 incident-report.md 的完整內容(若 agent 有寫入) */
  report: string | null;
  /** 耗時(秒) */
  elapsedSeconds: number;
}

export interface TriageOptions {
  /** checkpointer 的 thread id;同一 thread 可延續對話。 */
  threadId?: string;
  /** LangGraph 遞迴上限。deep agent + 多 subagent 步驟較多,預設 150。 */
  recursionLimit?: number;
}

/** 將 deepagents 虛擬檔案內容(v1 行陣列 / v2 字串或二進位)轉成字串。 */
function fileDataToString(file: FileData): string {
  const content = file.content;
  if (Array.isArray(content)) return content.join("\n");
  if (typeof content === "string") return content;
  return Buffer.from(content).toString("utf8");
}

/** 將訊息 content(字串或 content block 陣列)轉成純文字。 */
function messageContentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text);
        }
        return "";
      })
      .join("");
  }
  return content == null ? "" : String(content);
}

/** 從結果的虛擬檔案中找出 incident-report.md。 */
function extractReport(files: Record<string, FileData> | undefined): string | null {
  if (!files) return null;
  const keys = Object.keys(files);
  const exact = keys.find((k) => k.replace(/^\/+/, "") === "incident-report.md");
  const fuzzy = keys.find((k) => k.toLowerCase().includes("incident-report"));
  const key = exact ?? fuzzy;
  return key ? fileDataToString(files[key]) : null;
}

/** 取得事故 ID 字串。 */
function incidentRef(input: string | Incident): string {
  return typeof input === "string" ? input : input.id;
}

/** 啟動訊息 —— 引導 deep agent 走完整個調查流程。 */
function kickoffMessage(input: string | Incident): string {
  const steps =
    "(2) 用 write_todos 規劃調查;" +
    "(3) 把日誌、metrics、部署、runbook 四個方向的深度調查委派給對應 subagent;" +
    "(4) 交叉比對後判定嚴重度與疑似根因;" +
    "(5) 把完整報告寫入虛擬檔案 incident-report.md;(6) 最後用一段話摘要結果。";
  if (typeof input === "string") {
    return `請對事故 ${input} 進行完整 triage。\n步驟:(1) 先用 get_incident 取得詳情;${steps}`;
  }
  return (
    `請對以下事故進行完整 triage:\n\n` +
    "```json\n" +
    `${JSON.stringify(input, null, 2)}\n` +
    "```\n\n" +
    `步驟:(1) 確認受影響服務與觸發時間;${steps}`
  );
}

/** 對單一事故跑一次完整 triage。 */
export async function runTriage(
  input: string | Incident,
  options: TriageOptions = {},
): Promise<TriageResult> {
  const agent = await getOncallAgent();
  const incidentId = incidentRef(input);
  // 登錄完整事故物件 —— 真實後端無事故儲存,靠這個讓 get_incident(含 subagent 呼叫)查得到。
  if (typeof input !== "string") {
    rememberIncident(input);
  }
  const threadId = options.threadId ?? `triage-${incidentId}-${Date.now()}`;
  const start = Date.now();

  const result = await agent.invoke(
    { messages: [{ role: "user", content: kickoffMessage(input) }] },
    {
      configurable: { thread_id: threadId },
      recursionLimit: options.recursionLimit ?? 150,
    },
  );

  const elapsedSeconds = (Date.now() - start) / 1000;
  const messages = (result.messages ?? []) as { content?: unknown }[];
  const finalText = messageContentToString(messages.at(-1)?.content);
  const report = extractReport(result.files as Record<string, FileData> | undefined);

  return { incidentId, finalText, report, elapsedSeconds };
}

/**
 * 在既有 thread 上追問(沿用 checkpointer 記憶)。
 * 用於 Slack thread 內對先前 triage 結果的後續提問。
 */
export async function continueTriage(threadId: string, message: string): Promise<string> {
  const agent = await getOncallAgent();
  const result = await agent.invoke(
    { messages: [{ role: "user", content: message }] },
    { configurable: { thread_id: threadId }, recursionLimit: 100 },
  );
  const messages = (result.messages ?? []) as { content?: unknown }[];
  return messageContentToString(messages.at(-1)?.content);
}
