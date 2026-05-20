/**
 * 知識工具:search_runbooks、search_past_incidents。
 */
import { tool } from "langchain";
import { z } from "zod";
import { searchRunbooks as searchRunbooksKB } from "../knowledgeBase.js";
import { getBackend } from "./backends/index.js";

export const searchRunbooks = tool(
  async ({ query }) => {
    const hits = await searchRunbooksKB(query);
    if (hits.length === 0) {
      return `找不到與「${query}」相關的 runbook。`;
    }
    return hits
      .map(
        (hit) =>
          `### ${hit.title}\n來源: ${hit.path}(相關度 ${hit.score})\n\n${hit.content}`,
      )
      .join("\n\n---\n\n");
  },
  {
    name: "search_runbooks",
    description:
      "以關鍵字搜尋團隊 runbook(處理手冊),回傳最相關的數篇完整內容。" +
      "用來找出標準的診斷步驟與修復程序。建議用症狀或錯誤特徵當關鍵字," +
      "例如 OOMKilled、crashloop、5xx、rollback。",
    schema: z.object({
      query: z.string().describe("搜尋關鍵字,通常是症狀或錯誤特徵"),
    }),
  },
);

export const searchPastIncidents = tool(
  async ({ query }) => {
    const incidents = await getBackend().searchPastIncidents(query);
    if (incidents.length === 0) {
      return `找不到與「${query}」相關的歷史事故。`;
    }
    return JSON.stringify(incidents, null, 2);
  },
  {
    name: "search_past_incidents",
    description:
      "搜尋歷史相似事故,回傳當時的摘要與「解決方式」。" +
      "若找到高度相似的前例,其 resolution 往往就是本次最快的處置方向。",
    schema: z.object({
      query: z.string().describe("搜尋關鍵字,通常是症狀、錯誤特徵或服務名稱"),
    }),
  },
);
