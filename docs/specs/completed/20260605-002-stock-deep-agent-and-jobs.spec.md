# 股票 AI 機器人 — Deep Agent + LLM 編排 + 佇列 processors

> 建立日期: 2026-06-05
> 狀態: ✅ 已完成
> 完成日期: 2026-06-07
> 關聯計劃書: C:\Users\a4756\.claude\plans\ai-frolicking-fairy.md
> 前置 Spec: 20260605-001-stock-bot-foundation（地基 / 資料 / TA / 佇列）

---

## ⚠️ 架構變更紀錄（2026-06-07 收斂）

本 Spec 原始設計為 **Gemini Vertex（`ChatVertexAI`）+ `deepagents` `createDeepAgent`** 的多 LLM / 子 agent 架構。
開發過程中（見 [[vertex-sa-key-leaked]] / [[stock-claude-not-ready]]）專案**刻意收斂為 Claude-only**，原因：

1. Vertex service account 金鑰曾外洩，需停用該認證路徑，避免再次引入金鑰風險。
2. 單一 LLM（Claude）已能滿足分析 / 研究 / 問答 / 大盤報告的品質需求，移除 Vertex + LangChain `deepagents` 大幅降低相依與配額複雜度。

**因此下列原規劃檔案已「刻意不實作 / 移除」，非未完成項：**

| 原規劃檔案 | 現況 | 替代 |
| --- | --- | --- |
| `worker/src/llm/vertex.ts` | ❌ 不存在（移除） | 改 `worker/src/llm/claude.ts` 單一路徑 |
| `worker/src/agent/schemas.ts` / `tools.ts` / `subagents.ts` | ❌ 不存在 | 結構化輸出 / 資料整理內聚於 `claudeResearch.ts` |
| `worker/src/agent/liteResearch.ts` | ❌ 不存在（移除） | Claude 研究 + 降級 fallback 已涵蓋低配額情境 |

**實際落地（已驗證 worker type-check 通過）：** `llm/claude.ts`、`agent/{deepAgent,claudeResearch,claudeMarketResearch,marketReportAgent,index}.ts`、`agent/agent.test.ts`、`jobs/{analysis,research,digest,qa,workers,scheduler}.ts`、`run-tracker.ts`、`index.ts`。本 Spec 的功能目標（LLM 層、Deep Agent 報告、佇列 processors + 排程、優雅降級）皆達成，僅 LLM 供應商由 Vertex 改為 Claude。

---

## 目標

接上地基,實作核心智能與背景流程(計劃 Phase 5~6):

1. **LLM 層**:Gemini Vertex（`ChatVertexAI`，看圖 + 主模型）+ Claude Code CLI 子程序（`@anthropic-ai/claude-agent-sdk` 的 `query()`，深度推理）。
2. **Deep Agent**（`deepagents` `createDeepAgent`）：write_todos 規劃 + 子 agent 委派 + 虛擬檔案系統 + 結構化輸出（研究報告）。
3. **子 agent**：technical / chips / news / risk / report-writer。
4. **工具層**：取K線 / 算指標 / 畫圖 / Gemini看圖 / claudeReason / 取新聞 / 取法人 / 取漲幅榜。
5. **佇列 processors + scheduler**：analysis / research / digest workers（limiter + DLQ）+ 每日 14:00 排程。
6. **優雅降級**：缺 LLM 金鑰時 analysis 全程可跑（純資料+TA）；research/digest 退化為資料型報告，不崩潰。

## 背景

deepagents 1.10、claude-agent-sdk 0.3、@langchain/google-vertexai 2.1 已安裝。API 已實際檢視（createDeepAgent 接受 LangChain model + tools + subagents + responseFormat；query 回 `{type:'result',subtype:'success',result}`）。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `worker` | ✅ | 新增 llm / agent / jobs 模組;修改 index 註冊 workers + scheduler |
| `prisma` / `common` / `admin` | ❌ | 本 Spec 不動（admin 另立 Spec） |

---

## 受影響檔案

### worker

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/llm/vertex.ts` | 新增 | ChatVertexAI 工廠（service account env 認證）+ 看圖 |
| `worker/src/llm/claude.ts` | 新增 | claudeReason：query() 子程序收 result |
| `worker/src/agent/schemas.ts` | 新增 | zod 結構化輸出 schema（報告） |
| `worker/src/agent/tools.ts` | 新增 | LangChain tools（資料/指標/圖/看圖/claude/新聞/法人/漲幅） |
| `worker/src/agent/subagents.ts` | 新增 | 5 個子 agent 定義 |
| `worker/src/agent/deepAgent.ts` | 新增 | createDeepAgent 組裝 + runResearchAgent + 降級 |
| `worker/src/agent/liteResearch.ts` | 新增 | 精簡研究(2 次 Gemini:看圖+結構化彙整),低配額友善 |
| `worker/src/agent/claudeResearch.ts` | 新增 | Claude CLI 研究(不碰 Gemini,資料+訊號→Claude 撰報告) |
| `worker/src/agent/index.ts` | 新增 | re-export |
| `worker/src/run-tracker.ts` | 新增 | AnalysisRun 建立/更新 helper |
| `worker/src/jobs/analysis.ts` | 新增 | 分析 processor（資料+TA → AnalysisSignal） |
| `worker/src/jobs/research.ts` | 新增 | 研究 processor（agent → ResearchReport） |
| `worker/src/jobs/digest.ts` | 新增 | 漲幅摘要 processor |
| `worker/src/jobs/qa.ts` | 新增 | 自然語言問答 processor(Claude + 資料) |
| `worker/src/jobs/scheduler.ts` | 新增 | upsertJobScheduler 排程 |
| `worker/src/jobs/workers.ts` | 新增 | 建立 Workers（limiter + DLQ + 事件） |
| `worker/src/index.ts` | 修改 | 註冊 workers + scheduler + 優雅關機 |
| `worker/src/agent/agent.test.ts` | 新增 | 降級路徑單元測試（不需金鑰） |

---

## 邏輯變更點

- `llm/vertex.ts`：`getGeminiModel()` 用 `getVertexCredentials()` → `new ChatVertexAI({ model, location, authOptions:{ credentials } })`；`analyzeChartImage(pngBuffer, prompt)` 以 base64 image_url 呼叫。缺金鑰回 null（降級）。
- `llm/claude.ts`：`claudeReason(prompt, { maxTurns })` 迭代 `query()` 取 `subtype:'success'` 的 `result`；缺授權回 null。
- `agent/tools.ts`：以 `tool()` + zod 包裝各能力；圖工具把 PNG 寫進 deep agent 虛擬檔案系統路徑並回路徑。
- `agent/deepAgent.ts`：`runResearchAgent(symbol)` → 蒐資料 → createDeepAgent.invoke → 取 `structuredResponse`；LLM 不可用時走 `buildFallbackReport()`（資料+TA 組裝）。
- `jobs/*`：processor 函式；`workers.ts` 用 `new Worker(name, processor, { connection, concurrency, limiter })`；失敗耗盡重試 → 推 `<queue>-dlq`。
- `jobs/scheduler.ts`：`upsertJobScheduler` 平日 14:00 Asia/Taipei，對 watchlist 入列 analysis+research，並跑 digest。

## 預期測試結果

- [x] worker type-check 通過（2026-06-07 實測 `npm run type:check` 通過）
- [x] 降級路徑：缺金鑰時 `runResearchAgent` 回 fallback 報告、`generateSignal` 正常（`agent/agent.test.ts` 覆蓋；另見 [[stock-claude-not-ready]] 降級體驗 spec 018）
- [x] processors 在 mock 資料下產出 signal / report 物件

## 風險評估

- deepagents pre-1.0 API 變動：已鎖 1.10.2 並依實際型別撰寫。
- Claude CLI 在容器需 binary + 授權：缺則降級，不阻斷。
- Vertex 金鑰外洩需輪替（見計劃）。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/agent/deepAgent.ts` — Edit @ 2026-06-05 14:35
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/agent/liteResearch.ts` — Write @ 2026-06-05 14:59
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/llm/vertex.ts` — Edit @ 2026-06-05 15:28
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/llm/claude.ts` — Write @ 2026-06-05 15:58
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/agent/claudeResearch.ts` — Write @ 2026-06-05 15:59
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/agent/agent.test.ts` — Edit @ 2026-06-05 16:02
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/jobs/analysis.ts` — Edit @ 2026-06-05 16:41
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/jobs/qa.ts` — Write @ 2026-06-05 16:44
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/jobs/workers.ts` — Edit @ 2026-06-05 16:44
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/agent/claudeResearch.ts` — Edit @ 2026-06-06 00:35
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/jobs/scheduler.ts` — Edit @ 2026-06-06 03:20
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/jobs/scheduler.ts` — Write @ 2026-06-06 06:34
- `worker/src/jobs/workers.ts` — Edit @ 2026-06-06 10:54
- `worker/src/jobs/scheduler.ts` — Edit @ 2026-06-06 10:54
- `worker/src/jobs/qa.ts` — Edit @ 2026-06-06 12:54
- `worker/src/agent/claudeResearch.ts` — Edit @ 2026-06-06 13:08
- `worker/src/jobs/digest.ts` — Edit @ 2026-06-06 13:08
- `worker/src/agent/deepAgent.ts` — Edit @ 2026-06-06 13:08
- `worker/src/jobs/analysis.ts` — Edit @ 2026-06-06 16:05
