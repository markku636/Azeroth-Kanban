/**
 * 部署 / 變更工具:list_recent_deploys、get_pull_request。
 */
import { tool } from "langchain";
import { z } from "zod";
import { getBackend } from "./backends/index.js";

export const listRecentDeploys = tool(
  async ({ service, windowMinutes }) => {
    const deploys = await getBackend().listRecentDeploys(service, windowMinutes ?? 1440);
    if (deploys.length === 0) {
      return `服務 ${service} 在近期窗格內沒有部署紀錄。`;
    }
    return JSON.stringify(deploys, null, 2);
  },
  {
    name: "list_recent_deploys",
    description:
      "列出某服務近期的部署紀錄(版本、時間、commit、關聯 PR)。" +
      "用來比對「事故發生時間」與「變更時間」—— 事故前不久的部署是最常見的嫌疑。" +
      "別忘了也查下游 / 相依服務的部署。",
    schema: z.object({
      service: z.string().describe("服務名稱,例如 checkout-api"),
      windowMinutes: z
        .number()
        .min(1)
        .max(20160)
        .optional()
        .describe("回看的分鐘數,預設 1440(24 小時)"),
    }),
  },
);

export const getPullRequest = tool(
  async ({ repo, prNumber }) => {
    const pr = await getBackend().getPullRequest(repo, prNumber);
    if (!pr) {
      return `找不到 PR ${repo}#${prNumber}。`;
    }
    return JSON.stringify(pr, null, 2);
  },
  {
    name: "get_pull_request",
    description:
      "取得某 PR 的詳情,包含變更檔案清單、描述與 diff 重點摘要。" +
      "在用 list_recent_deploys 找到可疑部署後,用這個工具深入該 PR 看實際改了什麼。",
    schema: z.object({
      repo: z.string().describe("儲存庫名稱,例如 shop/checkout-api"),
      prNumber: z.number().describe("PR 編號,例如 482"),
    }),
  },
);
