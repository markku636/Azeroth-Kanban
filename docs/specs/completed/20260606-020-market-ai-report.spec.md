# 股票機器人 — 大盤 AI 盤勢解讀報告

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: docs/plans/doing/20260606-004-market-ai-report.md

---

## 目標

在大盤頁新增「AI 盤勢解讀」：彙整大盤＋國際盤＋期貨夜盤＋法人籌碼資料 → Claude 產報告 → 落庫 `MarketReport` → 頁面顯示最新一篇、可手動重跑、每日排程自動產生；Claude 不可用時降級資料摘要版。

## 背景

複用個股研究報告管線（Deep Agent + Claude + 降級 + 佇列 + 落庫）擴展到大盤層級。

> 參考實作：`worker/src/agent/deepAgent.ts`、`worker/src/agent/claudeResearch.ts`、`worker/src/jobs/research.ts`

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ✅ | 新增 `MarketReport` model + migration |
| `common` | ✅ | `StockJobType.MARKET_REPORT` + `MarketReportDto` |
| `worker` | ✅ | queue/enqueue、agent、processor、worker 註冊、scheduler |
| `admin` | ✅ | producer、service、API route、大盤頁 UI |

## 建議開發順序

1. `prisma` — 新增 model → migrate → generate
2. `common` — job type + DTO
3. `worker` — queue → agent → processor → 註冊 worker → scheduler
4. `admin` — stock-queue → stock-service → API → UI

---

## 受影響檔案

### prisma

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `prisma/schema.prisma` | 修改 | 新增 `MarketReport` model |

### common

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `common/src/stock-types.ts` | 修改 | `StockJobType.MARKET_REPORT`；`MarketReportDto` 介面 |

### worker

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/queue/queues.ts` | 修改 | `marketReportQueue` + `enqueueMarketReport()` + payload 型別 |
| `worker/src/agent/claudeMarketResearch.ts` | 新增 | Claude 撰寫大盤報告（讀 DB 資料 → facts → claudeReason → JSON） |
| `worker/src/agent/marketReportAgent.ts` | 新增 | orchestrator：試 Claude，失敗 → `buildMarketFallbackReport()` |
| `worker/src/jobs/marketReport.ts` | 新增 | processor：跑 agent → upsert MarketReport |
| `worker/src/jobs/workers.ts` | 修改 | 註冊 market-report worker（concurrency 1） |
| `worker/src/jobs/scheduler.ts` | 修改 | 新增每日 `daily-market-report` 排程（大盤+國際盤後） |

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-queue.ts` | 修改 | `enqueueMarketReport()` + MONITORED_QUEUES + EDITABLE_SCHEDULES |
| `admin/src/lib/stock-service.ts` | 修改 | `getMarketReport()` / `listMarketReports()` / `triggerMarketReport()` |
| `admin/src/app/api/v1/stock/market/report/route.ts` | 新增 | GET 最新報告、POST 觸發重跑 |
| `admin/src/app/(dashboard)/stock-bot/market/page.tsx` | 修改 | AI 盤勢解讀面板（產生/重新整理、sentiment、降級提示、DataSourceTag） |

---

## 邏輯變更點

### prisma
- `MarketReport`：`id / reportDate(@unique @db.Date) / title / summary(Text) / body(Text) / sentiment? / degraded(default false) / createdAt`，`@@map("market_report")`，`@@index([createdAt])`。

### common
- `StockJobType.MARKET_REPORT = 'market-report'`。
- `MarketReportDto { reportDate; title; summary; body; sentiment?: 'bullish'|'neutral'|'bearish'; degraded: boolean }`。

### worker
- `enqueueMarketReport(trigger='manual', force=false)`：dedup jobId `market-report-<taipeiDate>`，force 用唯一 id。
- `runClaudeMarketResearch()`：`Promise.all` 讀最新 `MarketDaily` + `GlobalMarketDaily`，組 facts（加權指數漲跌、廣度、前/後段類股、美股四大指數、台指期夜盤+基差、三大法人未平倉）→ prompt 要求 JSON `{title, summary, sentiment, body(Markdown：## 國際盤 / ## 大盤 / ## 類股輪動 / ## 籌碼 / ## 綜合研判)}` → `claudeReason` → `extractJson`，無資料或解析失敗則拋錯。
- `runMarketReportAgent()`：try Claude → catch → `buildMarketFallbackReport()`（純資料摘要 + `degraded:true` + 免責聲明）。
- `processMarketReport()`：`startRun('market-report')` → agent → `prisma.marketReport.upsert({ where:{ reportDate } })` → finishRun/failRun。
- workers.ts 註冊（concurrency 1）；scheduler 加 `daily-market-report`（pattern 例 `30 14 * * 1-5`）。

### admin
- stock-queue：`enqueueMarketReport(force)`；`MARKET_REPORT` 加入 MONITORED_QUEUES；`EDITABLE_SCHEDULES['daily-market-report']`。
- stock-service：`getMarketReport()` 回最新一篇；`triggerMarketReport()` 入列；（`listMarketReports()` 備歷史用）。
- API route：GET → getMarketReport；POST → triggerMarketReport；皆 `withPermission(STOCK_SIGNAL_VIEW)`。
- 大盤頁：新增區塊，「AI 盤勢解讀」標題 + 產生/重新整理鈕；有報告顯示 sentiment 徽章 + summary + body(whitespace-pre-wrap)；degraded 顯示黃字提示；`DataSourceTag source={AI_CLAUDE}`；POST 後沿用 timer 重新整理。

## 資料表異動

| 資料表 | 欄位 | 異動類型 | 詳細說明 |
| --- | --- | --- | --- |
| `market_report` | 全部（id/report_date/title/summary/body/sentiment/degraded/created_at） | 新增資料表 | 見 Plan；純新增、無外鍵、不影響現有資料 |

Migration 注意事項：
- [x] 純新增表，不影響現有資料
- [ ] down migration：drop table（prisma 自動）
- 指令：`npm run prisma:migrate`（名稱 `add_market_report`）→ `npm run prisma:generate`

## API 合約

| 端點 | 方法 | 請求 | 回應 |
| --- | --- | --- | --- |
| `/api/v1/stock/market/report` | GET | — | `ApiResult<MarketReportDto \| null>`（最新一篇） |
| `/api/v1/stock/market/report` | POST | — | `ApiResult<{ jobId }>` |

## 回滾計劃

1. 回退四子專案程式碼至上一版本
2. `prisma migrate` 回滾（drop `market_report`）後 `prisma:generate`

## 預期測試結果

- [ ] `npm run prisma:generate` 成功，型別含 `MarketReport`
- [ ] `npm run type:check` 全綠（common/admin/worker）
- [ ] 大盤頁出現「AI 盤勢解讀」面板；按「產生」後（worker 在線）數十秒內出現報告
- [ ] Claude CLI 可用 → 真報告（degraded=false）；不可用 → 資料摘要版（degraded=true，顯示提示）
- [ ] 報告以 reportDate 去重，重跑覆蓋當日

## 風險評估

- worker 未啟動：job 入列不消化 → UI 提示稍候；非程式錯誤。
- Claude CLI 未登入：自動降級，使用者仍有資料摘要版。
- 跨 workspace：DTO 置於 common 共用，避免型別漂移。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

<!-- 開發中追加 -->

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

大盤 AI 盤勢解讀報告：落庫＋可重跑＋每日排程，用 Claude CLI，降級保底。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 獨立 market-report 佇列 | ✅ 採納 | 低並行、可獨立重跑/排程、不卡大盤抓取 |
| Markdown 用 whitespace-pre-wrap | ✅ 採納 | 零依賴 |

### 產出摘要

完成（prisma → common → worker → admin 全部到位）：

- **prisma**：新增 `MarketReport` model，migration `20260606143334_add_market_report` 已套用，client 已重生（型別 + JS 含 MarketReport）。
- **common**：`StockJobType.MARKET_REPORT = 'market-report'`、`MarketReportDto`（含 `degraded`、sentiment bullish/neutral/bearish），index.ts 匯出；已重新 build dist。
- **worker**：`marketReportQueue` + `enqueueMarketReport`；`claudeMarketResearch.ts`（讀 MarketDaily+GlobalMarketDaily → facts → claudeReason → JSON）、`marketReportAgent.ts`（orchestrator + `buildMarketFallbackReport` degraded）、`marketReport.ts` processor（upsert by reportDate）；workers.ts 註冊（concurrency 1, 10/min）；scheduler 加 `daily-market-report`（30 14 平日）。
- **admin**：stock-queue `enqueueMarketReport` + MONITORED_QUEUES + EDITABLE_SCHEDULES；stock-service `getMarketReport` / `triggerMarketReport`；API `GET/POST /api/v1/stock/market/report`（GET=SIGNAL_VIEW、POST=BOT_ADMIN）；大盤頁內嵌 `MarketAiReport` 元件（sentiment 徽章、降級提示、summary + 可展開 body、DataSourceTag AI_CLAUDE）。

驗證：`npm run type:check` 全綠（admin + worker）；common dist build 成功；migration 已套用。

尚未驗證（需執行環境）：實際按「產生 AI 解讀」端到端跑（需 worker 在線 + Redis + 已登入 claude CLI）。Claude CLI 未登入時走降級資料摘要版。
