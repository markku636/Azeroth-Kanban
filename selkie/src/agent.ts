/**
 * 主 oncall agent —— 用 deepagents 的 createDeepAgent 組裝。
 *
 * createDeepAgent 會自動掛上:
 *  - 規劃中介層(write_todos)
 *  - 虛擬檔案系統(write_file / read_file / edit_file / ls / glob / grep)
 *  - subagent 委派中介層(task 工具)
 *  - 摘要中介層(長對話自動壓縮)
 * 我們再額外提供:Gemini 模型、oncall 系統提示、唯讀調查工具、四個專責 subagent。
 */
import { MemorySaver } from "@langchain/langgraph";
import { createDeepAgent } from "deepagents";
import type { StructuredTool } from "langchain";
import { loadMcpTools } from "./mcp.js";
import { makeModel } from "./model.js";
import { ONCALL_SYSTEM_PROMPT } from "./prompts.js";
import { subagents } from "./subagents/index.js";
import { allTools } from "./tools/index.js";

/**
 * 建立一個全新的 oncall deep agent。
 *
 * @param extraTools 額外工具(例如從 MCP server 載入的工具),併入內建唯讀工具。
 *
 * 回傳的是已編譯的 LangGraph graph,可 invoke / stream,並支援 checkpointer。
 * checkpointer 用 MemorySaver(行程內記憶);Slack / webhook 多輪對話會用到,
 * 未來要跨重啟持久化可換成 SqliteSaver / PostgresSaver。
 */
export function buildOncallAgent(extraTools: StructuredTool[] = []) {
  return createDeepAgent({
    name: "oncall-agent",
    model: makeModel(),
    systemPrompt: ONCALL_SYSTEM_PROMPT,
    tools: [...allTools, ...extraTools],
    subagents,
    checkpointer: new MemorySaver(),
  });
}

let cached: ReturnType<typeof buildOncallAgent> | null = null;

/**
 * 取得行程內共用的 oncall agent(單例,首次呼叫時會載入 MCP 工具)。
 *
 * checkpointer(MemorySaver)是「行程內記憶」,只有共用同一 agent 實例,
 * 同一 thread_id 的多輪對話才能延續(例如 Slack thread 內的追問)。
 */
export async function getOncallAgent() {
  if (!cached) {
    const mcpTools = await loadMcpTools();
    cached = buildOncallAgent(mcpTools);
  }
  return cached;
}
