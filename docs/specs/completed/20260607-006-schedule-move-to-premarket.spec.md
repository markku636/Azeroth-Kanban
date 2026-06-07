# 股票機器人 — 盤後分析排程改至隔天盤前（08:40）

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: 無

---

## 目標

把「盤後分析類」排程（track / digest / screen / market / market-report）從目前的 **13:50–14:30** 移到**隔天盤前 08:40（market-report 09:00）**，讓任務分析的是**已到齊的前一交易日完整資料**（價格 + 籌碼 + 法人），而非現行「當日資料尚未進 FinMind、實際只拿到前一交易日」的尷尬狀態。

## 背景

實測（2026-06-06 週六 16:00）FinMind `TaiwanStockPrice` / 三大法人 / 融資券最新都只到 6/5（週五），佐證 **FinMind 當日台股日資料約交易日深夜～凌晨才到齊**（官方文件提及約 01:30）。

故現行排程在 13:50–14:30（收盤 13:30 後 20 分～1 小時）執行時，FinMind **尚無當日資料**，任務實際分析的是**前一交易日**收盤。移到隔天盤前可確保資料完整且有「開盤前的最新可用收盤」可參考。

> `daily-global`（國際盤 / 期貨夜盤，07:00 週二~六）本就在早上、資料已到位，**維持不動**。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema 變更（`ScheduleConfig` 沿用，不改結構） |
| `common` | ❌ | 無 |
| `admin` | ✅ | `EDITABLE_SCHEDULES` 的 `defaultPattern` 同步更新（UI 顯示預設值 / 套用基準） |
| `worker` | ✅ | `scheduler.ts` 的 `SCHEDULES[].defaultPattern` 更新（啟動時 `upsertJobScheduler` 套用） |

## 建議開發順序

1. `worker` — 改 `scheduler.ts` 的 `defaultPattern`
2. `admin` — 改 `stock-queue.ts` `EDITABLE_SCHEDULES` 對應 `defaultPattern`（與 worker 一致）

---

## 受影響檔案

### worker

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/jobs/scheduler.ts` | 修改 | 更新 5 個 `defaultPattern` + 對應註解 |

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-queue.ts` | 修改 | `EDITABLE_SCHEDULES` 同 5 個 `defaultPattern` 與 worker 對齊 |

---

## 邏輯變更點

排程 cron pattern（時區 `Asia/Taipei`，皆平日 Mon–Fri `1-5`）：

| key | 現行 | 變更後 | 說明 |
| --- | --- | --- | --- |
| `daily-screen` | `50 13 * * 1-5`（13:50） | `40 8 * * 1-5`（08:40） | 股池選股掃描 |
| `daily-track` | `0 14 * * 1-5`（14:00） | `40 8 * * 1-5`（08:40） | watchlist 派發分析+研究 |
| `daily-digest` | `0 14 * * 1-5`（14:00） | `40 8 * * 1-5`（08:40） | 漲幅摘要 |
| `daily-market` | `10 14 * * 1-5`（14:10） | `40 8 * * 1-5`（08:40） | 大盤 / 類股輪動 |
| `daily-market-report` | `30 14 * * 1-5`（14:30） | `0 9 * * 1-5`（09:00） | AI 盤勢解讀；**依賴 `market` 先落庫 `marketDaily`，故錯開 20 分** |
| `daily-global` | `0 7 * * 2-6` | （不變） | 國際盤 / 期貨夜盤，早上執行、資料已到位 |

- `market-report` 排在 `market` 後 20 分（沿用原本 14:10→14:30 的安全間隔），確保 `runMarketReportAgent` 讀到的 `marketDaily.findFirst(desc)` 是當批最新。

## 資料表異動

<!-- 無資料庫變更 -->

無。`ScheduleConfig` 表結構不變。

## 套用方式（重要）

`scheduler.ts` 啟動時 `pattern = cfg?.pattern ?? defaultPattern`（[scheduler.ts:95](../../worker/src/jobs/scheduler.ts)）：

1. 改完 code 後**重啟 worker** → 對「**無 `ScheduleConfig` 覆寫**」的 key 會 `upsertJobScheduler` 套用新時間。
2. 若某 key 曾在後台編輯過（DB 有 `ScheduleConfig` 該列），**覆寫優先、code 預設不生效**；需在「機器人監控」頁把該排程時間改成 08:40 後儲存，或清掉該 `ScheduleConfig` 列。
3. 驗證：重啟後於監控頁確認各排程「下次執行」落在隔日 08:40 / 09:00。

## 回滾計劃

1. 還原 `worker/src/jobs/scheduler.ts` 與 `admin/src/lib/stock-queue.ts` 的 `defaultPattern`
2. 重啟 worker（覆寫情境同上，必要時於 UI 改回）

## 預期測試結果

- [x] `npm run type:check` 通過（admin + worker）
- [x] 監控頁 `describeSchedule` 由 pattern 解析時/分，改 pattern 後顯示與時間輸入框自動更新（無硬編時間）
- [ ]（待重啟 worker 驗證）監控頁 `daily-screen/track/digest/market` 下次執行 = 隔日 08:40
- [ ]（待驗證）`daily-market-report` 下次執行 = 隔日 09:00
- [ ]（待驗證）`daily-global` 維持 07:00 不變

## 風險評估

- 既有 `ScheduleConfig` 覆寫會蓋過 code 預設（見「套用方式」第 2 點）——非程式風險，屬部署注意事項，已在文件標明。
- 改時間不影響 job 邏輯，僅觸發時點；無資料相容性風險。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 Edit/Write 的檔案路徑 -->

## Bug Log

無。

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

承接 `0073` 防呆調查時的附帶發現：FinMind 當日資料約凌晨才到齊，13:50–14:30 排程實際分析前一交易日。使用者決定把盤後分析類排程移到**隔天盤前 08:40**，以「改 code 預設 + 重啟」方式套用。

### 關鍵問答

#### 目標時間？

**AI 回應摘要**: 提供「隔天 08:40（穩，盤前，前一日資料必齊）/ 當天 22:00（同日但可能還沒資料）/ 不改」三選項；使用者選 **08:40**。

#### market-report 要不要跟著移、要不要錯開？

**AI 回應摘要**: `runMarketReportAgent` 讀 `marketDaily.findFirst(desc)`，依賴 `market` 先落庫；沿用原本 20 分安全間隔，`market` 08:40 → `market-report` 09:00。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 移到隔天盤前 08:40 | ✅ 採納 | 前一交易日資料必齊、盤前可參考 |
| 移到當天 22:00 | ❌ 棄用 | FinMind 約凌晨才更新，22:00 可能拿不到當日 |
| 改 code 預設 + 重啟 | ✅ 採納 | 作為持久基準（無覆寫的 key 重啟即生效） |
| `daily-global` 一起改 | ❌ 棄用 | 本就早上、資料已到位，維持 07:00 |

### 產出摘要

- `worker/src/jobs/scheduler.ts`：`daily-track/digest/screen/market` → `40 8 * * 1-5`（08:40）、`daily-market-report` → `0 9 * * 1-5`（09:00）、`daily-global` 不變；更新頂部註解。
- `admin/src/lib/stock-queue.ts`：`EDITABLE_SCHEDULES` 同步上述 5 個 `defaultPattern`。
- `npm run type:check` 通過；監控頁時間描述由 pattern 動態解析，無硬編需改。
- 部署注意：需**重啟 worker** 生效；若有 `ScheduleConfig` 覆寫則覆寫優先，需於 UI 改或清該列。
