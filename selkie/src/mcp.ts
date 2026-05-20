/**
 * MCP 整合(Phase 7)—— 從 MCP server 載入工具,接上真實系統。
 *
 * 真實整合的「推薦路徑」:不自行串接各家 REST API,而是接上各服務的 MCP server
 *(PagerDuty / GitHub / Grafana / Datadog 等),讓 agent 直接取得它們的工具。
 *
 * 設定方式:在專案根目錄放一個 mcp.config.json(見 mcp.config.example.json)。
 * 若該檔不存在或載入失敗,loadMcpTools() 會回傳空陣列,agent 其餘功能不受影響。
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { StructuredTool } from "langchain";

const MCP_CONFIG_PATH = process.env.MCP_CONFIG ?? join(process.cwd(), "mcp.config.json");

let cachedTools: StructuredTool[] | null = null;

/**
 * 載入 MCP server 提供的工具(具快取)。
 * 沒有設定檔 → 回傳 []。載入失敗 → 印警告並回傳 [],不讓整個 agent 掛掉。
 */
export async function loadMcpTools(): Promise<StructuredTool[]> {
  if (cachedTools) return cachedTools;

  if (!existsSync(MCP_CONFIG_PATH)) {
    cachedTools = [];
    return cachedTools;
  }

  try {
    const parsed = JSON.parse(await readFile(MCP_CONFIG_PATH, "utf8")) as Record<string, unknown>;
    // 支援兩種寫法:{ mcpServers: {...} } 或直接 { serverName: {...} }
    const servers = (parsed.mcpServers ?? parsed) as Record<string, unknown>;

    if (!servers || Object.keys(servers).length === 0) {
      cachedTools = [];
      return cachedTools;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new MultiServerMCPClient(servers as any);
    const tools = (await client.getTools()) as unknown as StructuredTool[];
    console.log(
      `🔌 已從 MCP server 載入 ${tools.length} 個工具(${Object.keys(servers).join(", ")})。`,
    );
    cachedTools = tools;
    return cachedTools;
  } catch (err) {
    console.warn("⚠️  載入 MCP 工具失敗,本次將不使用 MCP 工具:", err);
    cachedTools = [];
    return cachedTools;
  }
}
