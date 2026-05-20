/**
 * 事故相關工具:get_incident、list_recent_alerts。
 *
 * Schema 刻意保持扁平、optional 欄位,以相容 Gemini function-calling。
 */
import { tool } from "langchain";
import { z } from "zod";
import { getBackend } from "./backends/index.js";

export const getIncident = tool(
  async ({ incidentId }) => {
    const incident = await getBackend().getIncident(incidentId);
    if (!incident) {
      return `找不到事故 ${incidentId}。請確認事故 ID 是否正確。`;
    }
    return JSON.stringify(incident, null, 2);
  },
  {
    name: "get_incident",
    description:
      "依事故 / 告警 ID 取得詳情(標題、受影響服務、來源、狀態、觸發時間、描述)。" +
      "這通常是調查事故的第一步,用來確認受影響的服務與時間點。",
    schema: z.object({
      incidentId: z.string().describe("事故 ID,例如 INC-1024"),
    }),
  },
);

export const listRecentAlerts = tool(
  async ({ service, windowMinutes }) => {
    const alerts = await getBackend().listRecentAlerts(service, windowMinutes ?? 120);
    if (alerts.length === 0) {
      return `服務 ${service} 在近期窗格內沒有其他告警。`;
    }
    return JSON.stringify(alerts, null, 2);
  },
  {
    name: "list_recent_alerts",
    description:
      "列出某服務近期觸發的所有告警。用來掌握事故全貌與告警的先後順序 —— " +
      "最先觸發的告警常常最接近根因。",
    schema: z.object({
      service: z.string().describe("服務名稱,例如 checkout-api"),
      windowMinutes: z
        .number()
        .min(1)
        .max(1440)
        .optional()
        .describe("回看的分鐘數,預設 120"),
    }),
  },
);
