/**
 * 可觀測性工具:query_logs、query_metrics。
 */
import { tool } from "langchain";
import { z } from "zod";
import { getBackend } from "./backends/index.js";

export const queryLogs = tool(
  async ({ service, query, windowMinutes }) => {
    const logs = await getBackend().queryLogs(service, query ?? "", windowMinutes ?? 120);
    if (logs.length === 0) {
      return `服務 ${service} 在近期窗格內沒有符合「${query ?? ""}」的日誌。`;
    }
    return JSON.stringify(logs, null, 2);
  },
  {
    name: "query_logs",
    description:
      "查詢某服務近期的應用 / 基礎設施日誌。用來尋找錯誤特徵、stack trace、例外訊息、" +
      "OOMKilled、逾時等。query 留空可取得該服務全部近期日誌。",
    schema: z.object({
      service: z.string().describe("服務名稱,例如 checkout-api"),
      query: z
        .string()
        .optional()
        .describe("關鍵字或過濾條件(如 error、OutOfMemoryError、timeout);留空取全部"),
      windowMinutes: z
        .number()
        .min(1)
        .max(1440)
        .optional()
        .describe("回看的分鐘數,預設 120"),
    }),
  },
);

export const queryMetrics = tool(
  async ({ service, metric, windowMinutes }) => {
    const series = await getBackend().queryMetrics(service, metric ?? "", windowMinutes ?? 120);
    if (series.length === 0) {
      return `服務 ${service} 找不到符合「${metric ?? ""}」的 metric。`;
    }
    return JSON.stringify(series, null, 2);
  },
  {
    name: "query_metrics",
    description:
      "查詢某服務近期的 metric 時間序列(每段序列附人類可讀 summary)。" +
      "用來定位異常的起始時間與型態 —— 例如記憶體攀升、錯誤率飆升、延遲惡化、CPU 飽和。" +
      "metric 留空可取得該服務全部 metric。",
    schema: z.object({
      service: z.string().describe("服務名稱,例如 checkout-api"),
      metric: z
        .string()
        .optional()
        .describe("metric 名稱關鍵字,如 memory、error_rate、latency、cpu;留空取全部"),
      windowMinutes: z
        .number()
        .min(1)
        .max(1440)
        .optional()
        .describe("回看的分鐘數,預設 120"),
    }),
  },
);
