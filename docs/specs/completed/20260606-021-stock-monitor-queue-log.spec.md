# 股票機器人 — 監控頁依佇列查 log + 單筆 job 詳情 Modal

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成（程式碼完成 + type:check 通過；實機點擊操作待使用者確認）
> 關聯計劃書: 無（監控頁 UX 增強，單一 admin 子專案）

---

## 目標

讓 `/stock-bot/monitor` 監控頁的「近期 Job」可以：

1. **依佇列查 log** — 點「佇列狀態」的佇列卡片，下方「近期 Job」表格就地篩選成只看該佇列（依 `AnalysisRun.type`）的 job；可清除回到全部。
2. **單筆 job 詳情** — 點某一列 job，開 Modal 顯示完整 log（`input` / `output` / `error` 完整 JSON），解決目前「結果 / 錯誤」欄被 `truncate` 看不到全文的問題。

## 背景

目前「近期 Job」表格把**所有佇列**的 job 混在一起，且「結果 / 錯誤」欄 `max-w-xs truncate` 只能 hover 看 `title`。使用者想「依佇列查 log」並能看單筆完整內容。

關鍵事實（探查結論）：
- **佇列名稱 == job `type`**：worker 各 processor 以 `startRun('<type>', …)` 寫入 `AnalysisRun`（`worker/src/jobs/*.ts`），type 與 BullMQ 佇列名稱一一對應（`analysis` / `research` / `digest` / `screen` / `market` / `global` / `qa`）→ 依佇列篩選 == 依 `type` 篩選。
- **例外 `line-push`**：worker 未對 line-push 呼叫 `startRun`，故無 `AnalysisRun` 紀錄，點它表格為空（顯示既有「尚無 job 紀錄」）。屬已知行為。
- **完整 log 已在現有 API 回應**：`getJobs()` 回傳 `{ ...r, summary }`，`r` 為完整 `AnalysisRun`（含 `input`/`output`/`error`/`jobId`），前端僅未渲染 → 詳情 Modal **不需新後端 endpoint**。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | **無 DB schema 變更**（篩選用既有 `analysis_run.type` 欄位，無 migration） |
| `common` | ❌ | 無共用型別變更 |
| `admin` | ✅ | `getJobs()` 加可選 type 篩選；jobs route 轉發 `?type=`；monitor 頁加佇列篩選 + 詳情 Modal |

## 建議開發順序

1. `admin`（service）— `getJobs()` 加 `type` 篩選
2. `admin`（route）— `jobs/route.ts` 讀並轉發 `?type=`
3. `admin`（前端）— `monitor/page.tsx` 佇列卡片可點篩選 + 列可點開詳情 Modal

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-service.ts` | 修改 | `getJobs(limit, type?)` 加可選 `type`，`where` 同套用於 `findMany` 與 `groupBy`（統計同步反映篩選） |
| `admin/src/app/api/v1/stock/jobs/route.ts` | 修改 | 讀取 `?type=` query 並轉發給 `getJobs` |
| `admin/src/app/(dashboard)/stock-bot/monitor/page.tsx` | 修改 | `JobRow` 補欄位；新增 `selectedQueue`/`selectedJob` state；`refresh` 帶 type 篩選；佇列卡片可點（toggle 篩選 + 高亮）；篩選指示器；job 列可點開詳情 Modal |

**重用既有元件**：`Modal`（`admin/src/components/modal.tsx`）；詳情 JSON `<pre>` 排版沿用 `ApiResultPanel`（`admin/src/components/api-result-panel.tsx`）既有樣式。

---

## 邏輯變更點

### admin（service）— `stock-service.ts`
- `getJobs(limit = 50, type?: string)`：`const where = type ? { type } : undefined;`，`findMany({ where, … })` 與 `groupBy({ by: ['status'], where, … })` 同步套用。可選參數向後相容（唯一呼叫端為 jobs route）。

### admin（route）— `jobs/route.ts`
- 讀 `const type = request.nextUrl.searchParams.get('type') ?? undefined;`，轉發 `getJobs(limit, type || undefined)`。

### admin（前端）— `monitor/page.tsx`
- `JobRow` 介面補上（已在回應中、僅未宣告）：`input?: unknown; output?: unknown; jobId?: string | null;`。
- 新 state：`selectedQueue: string | null`、`selectedJob: JobRow | null`。
- `refresh`：jobs URL 改 `/api/v1/stock/jobs?limit=50${selectedQueue ? '&type=' + selectedQueue : ''}`；`selectedQueue` 加入 `useCallback` 依賴 → 選取改變立即重抓 + 重訂 5 秒輪詢。
- 佇列卡片 `<div>`：加 `onClick` toggle（再點同卡 = 取消）、`cursor-pointer`、選中 `ring-2 ring-blue-500`。
- 「近期 Job」標題列：`selectedQueue` 存在時顯示「篩選中：{queue}」+ ✕ 清除鈕。
- job `<tr>`：加 `onClick={() => setSelectedJob(j)}`、`cursor-pointer hover:bg-gray-50`；既有「重跑」鈕所在 `<td>` 加 `onClick={(e) => e.stopPropagation()}`。
- 詳情 `Modal`（`size="lg"`）：基本資訊（type/symbol/status/jobId/createdAt/updatedAt）+ 輸入/輸出/錯誤 JSON 區塊；`input`/`output` 為 null 時不渲染殘影。

## API 合約

| 端點 | 方法 | 請求格式變更 | 回應格式變更 |
| --- | --- | --- | --- |
| `/api/v1/stock/jobs` | GET | **新增可選** query `?type=<佇列名/job type>`；缺省＝全部 | 不變（既有 `{ jobs, stats }`；`jobs` 已含 `input`/`output`/`error`/`jobId`） |

> 向後相容：`?type=` 為新增可選參數，現有呼叫不受影響。

## 回滾計劃

1. `git revert` 本 Spec 對應 commit（3 檔變更）。
2. 無 DB、無新依賴、無新檔，回滾零風險。

## 預期測試結果

- [x] `npm run type:check` 通過（admin + worker 全綠）
- [ ] 點 analysis 佇列卡片 → 表格只剩 analysis、卡片高亮、出現「篩選中：analysis ✕」、表頭統計同步（實機待確認）
- [ ] 再點同卡 / 按 ✕ → 清除篩選恢復全部（實機待確認）
- [ ] 點稀疏佇列（global/market）→ 表格顯示該佇列歷史（驗證為伺服端依 type 撈，非僅濾最近 50）（實機待確認）
- [ ] 點 line-push → 顯示「尚無 job 紀錄」（預期）（實機待確認）
- [ ] 點任一 job 列 → Modal 顯示完整 input/output/error；FAILED 的 error 完整可見（實機待確認）
- [ ] 點 FAILED 列「重跑」鈕 → 只重跑、不開 Modal（實機待確認）

## 風險評估

- `selectedQueue` 進 `refresh` 依賴會重訂 interval → 成本可忽略，且帶來即時篩選回饋（預期行為）。
- 詳情 Modal 顯示完整 `input`/`output` JSON，資料已隨既有 5 秒輪詢傳輸（payload 不變），無額外負載。
- lint/format 工具鏈於 next16 升級後失效，本次以 `type:check` 把關（見 memory：lint-format-toolchain-broken）。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認
監控頁「近期 Job」支援依佇列就地篩選，並可點單列開 Modal 看完整 log（input/output/error）。

### 關鍵問答

#### 「依佇列查 log」要怎麼呈現？
**AI 回應摘要**: 提供三選項（就地篩選表格 / 彈窗列出 / 上方下拉）→ 使用者選「就地篩選表格」。並確認加碼「點單列開詳情 Modal」看完整 JSON。探查發現佇列名==job type、完整 log 已在現有 API 回應中，故詳情不需新 endpoint，依佇列篩選只需 service 加可選 `type`。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 佇列卡片點擊 → 就地篩選「近期 Job」表格 | ✅ 採納 | 最貼近現有畫面、改動最小（使用者選定） |
| 伺服端依 `type` 篩選（非純前端濾最近 50） | ✅ 採納 | 稀疏佇列（global/market）才能看到完整歷史，避免「查不到」誤導 |
| 單列點擊 → 開詳情 Modal 顯示完整 input/output/error | ✅ 採納 | 解決 truncate 看不到全文；資料已在回應中，零後端成本 |
| 為詳情新增 `GET /jobs/[id]` endpoint | ❌ 棄用 | `getJobs` 已回傳完整 `AnalysisRun`，無需多一支 API |

### 產出摘要

<!-- AI 完成後自動更新 -->

**後端（admin）**
- `getJobs(limit = 50, type?: string)`：`const where = type ? { type } : undefined;` 同步套用於 `findMany` 與 `groupBy`，讓表頭 DONE/RUNNING/FAILED 統計也反映目前篩選；可選參數向後相容。
- `jobs/route.ts`：讀 `?type=` query，`getJobs(limit, type || undefined)` 轉發（空字串視為無篩選）。

**前端（admin）— `monitor/page.tsx`**
- `JobRow` 補 `input?`/`output?`/`jobId?`（資料早已在 `getJobs` 回應中，僅未宣告渲染）。
- 新 state `selectedQueue` / `selectedJob`；`refresh` 依 `selectedQueue` 組 `?type=` 並列入 `useCallback` 依賴（選取改變即時重抓）。
- 佇列卡片 `<div>` → `<button>`：點擊 toggle 篩選（再點同卡取消）、選中 `ring-2 ring-blue-500`；「近期 Job」標題列加「篩選中：{queue} ✕」清除鈕。
- job `<tr>` 加 `cursor-pointer hover:bg-gray-50` + `onClick` 開 `selectedJob`；「重跑」鈕 `onClick` 內 `e.stopPropagation()` 避免誤觸開窗。
- 詳情 `Modal`（重用 `@/components/modal`，`size="lg"`）：基本資訊 `<dl>` + 輸入/輸出/錯誤三個 `<pre>`（共用 `LOG_PRE_CLASS` 常數，顏色各補）；`input`/`output` 為 null 顯示「—」不印殘影。

**驗證**：`npm run type:check` admin + worker 全綠。檔案另有 2 條既有 React 警告（`useEffect` 內 `void refresh()`、`nextRunText` 內 `Date.now()`）屬本次未觸及之既有碼，非本次引入。

**留意**：本次開發期間 `monitor/page.tsx` 正被另一份 🔵 Spec（`20260606-016-schedule-run-log-and-manual-trigger`）同時編輯（排程執行紀錄 / 立即執行），曾數次出現「file modified since read」需重讀；最終三檔變更與該功能無重疊、type:check 全綠。
- `admin/src/lib/stock-service.ts` — Edit @ 2026-06-07 04:41
