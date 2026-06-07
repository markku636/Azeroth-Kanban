# 股票機器人 — 排程任務執行紀錄 + 手動立即執行

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: 無

---

## 目標

監控頁「排程任務」每一列：① 可查到**每一次執行的 log**（時間 / 觸發來源 / 狀態 / 結果摘要 / 錯誤）；② 提供「立即執行」按鈕（含二次確認）手動觸發該排程，不必等下次 cron。

## 背景

現況四個排程任務（追蹤關注股 / 每日漲幅摘要 / 股池選股掃描 / 大盤類股輪動）只看得到「下次執行時間」，看不到「過去每次執行的結果」，也無法手動觸發。

現有 `AnalysisRun` 表雖記錄 digest/screen/market/analysis 的執行，但：
- **追蹤關注股（daily-track / dispatch）完全沒有落庫**（dispatcher 直接 return，未走 run-tracker）。
- 無「排程層級」單一時間軸，也無法區分「排程觸發」vs「手動觸發」。

故新增 `ScheduleRun` 表，每個排程每次執行寫一筆，作為排程層級的執行紀錄。

> 注意：`enqueueScreen` / `enqueueMarket` 使用「當日 jobId」（`screen-YYYY-MM-DD`）去重，若當天排程已跑過，手動「立即執行」會被 BullMQ 靜默擋下。手動觸發必須用**唯一 jobId（force）**繞過當日去重才會真的執行。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ✅ | 新增 `ScheduleRun` model（沿用既有 `RunStatus` enum）+ migration |
| `common` | ❌ | 無共用型別變更（排程 key/label 沿用各端既有定義） |
| `admin` | ✅ | 新增 2 支 API + service 函式 + queue producer；監控頁 UI |
| `worker` | ✅ | 新增 schedule-run tracker；4 個排程 handler 包裹落庫；scheduler 補 trigger |

## 建議開發順序

1. `prisma` — 新增 `ScheduleRun` model + `npm run prisma:migrate`
2. `worker` — schedule-run-tracker + 4 handler 包裹 + scheduler trigger 標記
3. `admin` — queue producer（force / dispatch）+ service + API routes + 監控頁 UI

---

## 受影響檔案

### prisma

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `prisma/schema.prisma` | 修改 | 新增 `model ScheduleRun`（沿用 `RunStatus`） |
| `prisma/migrations/**` | 新增 | `schedule_run` 建表 migration（自動產生） |

### worker

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/schedule-run-tracker.ts` | 新增 | `startScheduleRun` / `finishScheduleRun` / `failScheduleRun` |
| `worker/src/jobs/scheduler.ts` | 修改 | `dispatchWatchlist(trigger)` 包 ScheduleRun（`daily-track`）；digest/track scheduler data 補 `trigger:'schedule'` |
| `worker/src/jobs/screen.ts` | 修改 | 包 ScheduleRun（`daily-screen`，trigger 取 `job.data.trigger`） |
| `worker/src/jobs/market.ts` | 修改 | 包 ScheduleRun（`daily-market`） |
| `worker/src/jobs/digest.ts` | 修改 | 包 ScheduleRun（`daily-digest`） |
| `worker/src/jobs/global.ts` | 修改 | 包 ScheduleRun（`daily-global`，第 5 個排程，trigger 取 `job.data.trigger`） |

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-queue.ts` | 修改 | 新增 `enqueueDispatch(trigger)`；`enqueueScreen/enqueueMarket` 加 `force` 參數（唯一 jobId）；`EDITABLE_SCHEDULES` 的 digest/track data 補 `trigger:'schedule'` |
| `admin/src/lib/stock-service.ts` | 修改 | 新增 `runScheduleNow(key)` + `getScheduleRuns(key, limit)` |
| `admin/src/app/api/v1/stock/schedules/run/route.ts` | 新增 | `POST` 手動觸發排程（body `{ key }`） |
| `admin/src/app/api/v1/stock/schedules/runs/route.ts` | 新增 | `GET` 查某排程執行紀錄（query `key`、`limit`） |
| `admin/src/app/(dashboard)/stock-bot/monitor/page.tsx` | 修改 | 每列加「立即執行」（confirm）+「查看紀錄」展開時間軸 |

---

## 邏輯變更點

### worker

- `schedule-run-tracker.ts`：
  - `startScheduleRun(key, trigger)` → 建 `ScheduleRun`（status `RUNNING`），回傳 id
  - `finishScheduleRun(id, result)` → status `DONE` + `result` 摘要 + `finishedAt`
  - `failScheduleRun(id, error)` → status `FAILED` + `error` + `finishedAt`
- 五個 handler 統一模式：進入時 `startScheduleRun(key, job.data.trigger ?? 'schedule')`，成功 `finishScheduleRun`、失敗 `failScheduleRun` 後 rethrow。result 摘要：screen→`派發 N 檔`、market→`大盤已更新`、digest→`漲幅榜 N 檔`、track→`派發 N 檔（分析+研究）`、global→`國際盤已更新`。
- `dispatchWatchlist` 改收 `trigger` 參數；dispatcher Worker callback 改 `async (job) => dispatchWatchlist(job.data?.trigger)`。
- scheduler digest/track 註冊 data 補 `trigger:'schedule'`，避免排程觸發被誤標。

### admin

- `enqueueDispatch(trigger='manual')`：對 `dispatch` 佇列 add `'track'` job，唯一 jobId `manual-dispatch-{Date.now()}`。
- `enqueueScreen/enqueueMarket/enqueueGlobal` 加 `force`：true 時用 `manual-screen-{ts}` / `manual-market-{ts}` / `manual-global-{ts}` 繞過當日去重。
- `enqueueDigest(topN, trigger='manual')`：job data 補 `trigger`，供 digest handler 區分手動 / 排程。
- `runScheduleNow(key)`：key→動作映射（`daily-track`→`enqueueDispatch`、`daily-digest`→`enqueueDigest`、`daily-screen`→`enqueueScreen(force)`、`daily-market`→`enqueueMarket(force)`、`daily-global`→`enqueueGlobal(force)`），回 `ApiResult<{ jobId }>`；未知 key 回 `VALIDATION_ERROR`。
- `getScheduleRuns(key, limit)`：查 `ScheduleRun` where key、`orderBy startedAt desc`、take `min(limit,50)`，回 `ApiResult`。

### 監控頁

- 排程列新增「立即執行」鈕 → `window.confirm('確定立即執行「{label}」？')` → `POST /api/v1/stock/schedules/run` → 完成後 `refresh()`。
- 排程列新增「查看紀錄」展開：開啟時 `GET /api/v1/stock/schedules/runs?key=...&limit=20`，渲染時間軸（時間 / 觸發來源 badge / 狀態色 / 結果或錯誤）。

## 資料表異動

⚠️ **本次有資料庫異動**，受影響資料表：`schedule_run`（新增）。

| 資料表 | 欄位 | 異動類型 | 詳細說明（型別、約束、預設值） |
| --- | --- | --- | --- |
| `schedule_run` | `id` | 新增表 | `String @id @default(cuid())` |
| `schedule_run` | `key` | 新增欄位 | `String`，排程 key（`daily-track` 等） |
| `schedule_run` | `trigger` | 新增欄位 | `String @default("schedule")`，`schedule` / `manual` / `command` |
| `schedule_run` | `status` | 新增欄位 | `RunStatus @default(RUNNING)`（沿用既有 enum） |
| `schedule_run` | `result` | 新增欄位 | `String? @db.Text`，人類可讀結果摘要 |
| `schedule_run` | `error` | 新增欄位 | `String? @db.Text` |
| `schedule_run` | `started_at` | 新增欄位 | `DateTime @default(now())` |
| `schedule_run` | `finished_at` | 新增欄位 | `DateTime?` |
| `schedule_run` | index | 新增索引 | `@@index([key, startedAt])`，依排程查最近紀錄 |

Migration 注意事項：
- [x] 需要 down migration（drop table `schedule_run`）
- [ ] 影響現有資料（純新增表，無資料遷移）
- [ ] 影響 index（僅新表自身索引）
- [ ] 外鍵約束變更（無外鍵）

## API 合約

| 端點 | 方法 | 請求格式 | 回應格式 |
| --- | --- | --- | --- |
| `/api/v1/stock/schedules/run` | POST | `{ key: string }` | `ApiResult<{ jobId: string }>` |
| `/api/v1/stock/schedules/runs` | GET | query `key`（必填）、`limit`（選填，預設 20） | `ApiResult<{ runs: ScheduleRunRow[] }>` |

兩支均以 `withPermission(PERMISSIONS.STOCK_BOT_ADMIN)` 守衛（與現有 stock API 一致）。

## 回滾計劃

1. 程式碼回退至上一版本（移除新 API / service / UI / worker tracker 呼叫）。
2. 執行 down migration 移除 `schedule_run` 表。

## 預期測試結果

- [x] `npm run type:check` 通過（admin + worker）
- [x] migrate 後 `schedule_run` 表存在（migration `20260606145841_add_schedule_run` 已套用）
- [x] `ScheduleRun` 表 client round-trip（create → read → delete，欄位齊全）驗證通過
- [x] 追蹤關注股（track）手動觸發後寫入 ScheduleRun（過去完全無紀錄）— 已用實際 BullMQ `dispatch/track` job 跑通，產出 `key=daily-track, trigger=manual, status=DONE, result="派發 2 檔（分析+研究）"`
- [x] 「立即執行 → 入列並執行」鏈路（`enqueueDispatch → worker dispatchWatchlist → ScheduleRun`）runtime 驗證通過（track 路徑）
- [ ] 透過監控頁 UI 實際點「立即執行」/「查看紀錄」做最終 click-through（需 admin server 起 + 已登入 session；後端鏈路已逐段驗證）

> 補充：監控頁現有 6 個排程列（新增「大盤 AI 盤勢解讀」`daily-market-report`，屬平行開發中的 spec 020）。本次「立即執行」對 6 列皆可用（`runScheduleNow` 已映射 `daily-market-report`→`enqueueMarketReport(true)`）；但 market-report handler 的 ScheduleRun 落庫由 spec 020 負責，未納入本次，故其「查看紀錄」在該 handler 包裹前會是空的。

## 風險評估

- worker 與 admin 共用同一 Prisma client，migrate 後雙方都要重啟才會載入新表（worker 需 detach 重啟，見 [[stock-worker-runtime]]）。
- 「立即執行」追蹤關注股會對整個 active watchlist 派發 analysis+research，量大；底層 analysis/research 仍走當日去重，不致重複大量重算。
- force 觸發 screen/market 用唯一 jobId，當日可被多次手動觸發（符合預期；非錯誤）。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 Edit/Write 的檔案路徑 -->

## Bug Log

{開發過程中遇到的 Bug}

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

排程任務每列要能「查每一次執行 log」+「手動立即執行（含確認）」。

### 關鍵問答

#### 排程 log 記錄層級？

**AI 回應摘要**: 提供三案（新表 / 新表+子 job 展開 / 沿用 AnalysisRun）。使用者選「新增 `ScheduleRun` 表」——排程層級單筆紀錄，能乾淨涵蓋無單一 type 的「追蹤關注股」，並可區分排程 / 手動觸發。

#### 立即執行是否二次確認？

**AI 回應摘要**: 使用者選「跳確認框」，避免誤觸（尤其追蹤關注股會派發整個關注清單）。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 新增 `ScheduleRun` 表記排程層級執行 | ✅ 採納 | 追蹤關注股無單一 type，且需區分觸發來源 |
| 沿用 `AnalysisRun` 過濾 | ❌ 棄用 | track 無法乾淨對應、無觸發來源欄位 |
| 手動觸發用唯一 jobId（force） | ✅ 採納 | 繞過 screen/market 當日去重，確保真的執行 |
| 立即執行加 `confirm` 二次確認 | ✅ 採納 | 防誤觸（track 會大量派發） |

### 產出摘要

<!-- AI 完成後自動更新 -->
- `admin/src/app/(dashboard)/stock-bot/monitor/page.tsx` — Edit @ 2026-06-06 12:30
- `worker/src/schedule-run-tracker.ts` — Write @ 2026-06-06 14:59
- `worker/src/jobs/screen.ts` — Edit @ 2026-06-06 15:00
- `worker/src/jobs/market.ts` — Edit @ 2026-06-06 15:00
- `worker/src/jobs/global.ts` — Edit @ 2026-06-06 15:00
- `admin/src/app/api/v1/stock/schedules/run/route.ts` — Write @ 2026-06-06 15:05
- `admin/src/app/api/v1/stock/schedules/runs/route.ts` — Write @ 2026-06-06 15:05
