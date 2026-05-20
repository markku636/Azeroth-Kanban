/**
 * 行程內事故登錄表。
 *
 * 真實後端(real.ts)沒有事故儲存 —— 事故住在 admin 的 Postgres,不在 selkie。
 * 但「當前正在 triage 的事故」其完整詳情已於 runTriage 帶入。把它登錄起來,
 * 讓 get_incident 工具查得到 —— 特別是 subagent:它們看不到主 agent 的 kickoff
 * 訊息,只能靠 get_incident 取得服務名稱與觸發時間。
 */
import type { Incident } from "../../schemas.js";

const registry = new Map<string, Incident>();

/** 登錄一筆事故,使 get_incident 之後查得到。 */
export function rememberIncident(incident: Incident): void {
  registry.set(incident.id, incident);
}

/** 依 ID 取回已登錄的事故;查無則回 null。 */
export function recallIncident(id: string): Incident | null {
  return registry.get(id) ?? null;
}
