# 股票機器人 — 關注清單獨立頁（選單入口 + 排序/篩選 + 一鍵全部分析/研究 + 紅綠燈結論 + 目標/停損價到價提醒）

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 完成日期: 2026-06-07
> 關聯計劃書: 無（中型，單一子專案 admin、無 schema 異動）

---

## 目標

把目前塞在 Console（`/stock-bot/console`）內的「關注清單」升級為**獨立頁面**並加入左側選單，附加四項功能：

1. **排序 / 篩選** — 依漲跌%、評分、代號排序；快速篩出「評分高(≥70)/低(≤40)」「今日上漲/下跌」。
2. **一鍵全部分析 / 研究** — 頂部按鈕，對清單所有關注股批次觸發分析或 AI 研究（沿用既有單檔 queue API）。
3. **紅綠燈結論欄** — 每列顯示多週期 KD 傻瓜紅綠燈結論（買/觀望/避開），沿用既有 `computeKdVerdict`。
4. **目標價 / 停損價 + 到價提醒** — 每列可設定目標價與停損價，收盤到價時透過**既有 Alert 引擎 + LINE 推播**通知。

## 背景

- 關注清單目前是 Console 頁裡的一段表格（代號/名稱、最新價、漲跌%、評分、分析/研究/詳情/移除），選單無獨立入口。
- 後端 `listWatchlist()`（`admin/src/lib/stock-service.ts`）已彙整名稱 + 行情 + 評分。
- KD 紅綠燈結論由純函式 `computeKdVerdict(points)`（`admin/src/lib/kd-verdict.ts`）以日線 Bar[] 計算，可在 service 層直接呼叫。
- **關鍵：目標/停損價無需新增資料表欄位。** Alert 模型已支援 `PRICE_ABOVE`/`PRICE_BELOW`，worker 端 `runAlertChecks()`（`worker/src/alerts.ts`）已於分析時檢查並推播 LINE。因此：
  - 目標價 → 該股一筆 `PRICE_ABOVE` alert
  - 停損價 → 該股一筆 `PRICE_BELOW` alert
- 故本任務**無資料庫異動**，純 admin 層讀寫既有 `Alert` / `Watchlist` / `StockDailyPrice` / `AnalysisSignal`。

> 設計取捨：目標/停損價以「複用 Alert」實作而非「Watchlist 新增欄位」，理由為單一真實來源（避免價格門檻同時存在兩處）、零 schema 異動、且自動接上既有 worker 推播鏈路。每股每方向以「該 member 該 symbol 的最近一筆對應 type alert」為準，設定為 upsert、清空為刪除。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema / migration / seed 變更 |
| `common` | ❌ | 沿用既有 `KdVerdict` 等型別 |
| `admin` | ✅ | 新增獨立頁 + 2 個 API route；service 層新增 overview / 目標價 upsert；選單 + 路由 + i18n |

## 建議開發順序

1. `admin` — service 層（`stock-service.ts`）→ API route → 頁面（`page.tsx`）→ 路由/選單/i18n

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-service.ts` | 修改 | 新增 `WatchlistOverviewDto`、`listWatchlistOverview()`、private helper `verdictMap()` 與 `watchTargetsMap()`；新增 `setWatchTargets()`（upsert/clear PRICE_ABOVE/PRICE_BELOW alert） |
| `admin/src/app/api/v1/stock/watchlist/overview/route.ts` | 新增 | GET：回傳含 verdict + 目標/停損價的彙整清單（`STOCK_SIGNAL_VIEW`） |
| `admin/src/app/api/v1/stock/watchlist/targets/route.ts` | 新增 | PUT：設定/清除某 symbol 的目標價/停損價（`STOCK_WATCH_MANAGE`） |
| `admin/src/app/(dashboard)/stock-bot/watchlist/page.tsx` | 新增 | 獨立頁：加入框 + 排序/篩選列 + 一鍵全部分析/研究 + 行情/評分/紅綠燈/目標停損表格 |
| `admin/src/config/routes.ts` | 修改 | `stockBot` 新增 `watchlist: '/stock-bot/watchlist'` |
| `admin/src/layouts/hydrogen/menu-items.tsx` | 修改 | 股票區塊新增「關注清單」選單項（`STOCK_SIGNAL_VIEW`） |
| `admin/src/locales/zh-TW.json` | 修改 | 新增 `admin.menu.stockWatchlist`（設定檔，hook 豁免） |
| `admin/src/locales/en.json` | 修改 | 新增 `admin.menu.stockWatchlist`（設定檔，hook 豁免） |

> 共用元件 `StockCombobox`（`admin/src/app/(dashboard)/stock-bot/console/StockCombobox.tsx`）以相對路徑沿用，不複製。

---

## 邏輯變更點

### admin — `stock-service.ts`

- 新增 `WatchlistOverviewDto`：在既有 `WatchlistDto` 欄位上補 `verdictLevel`（`buy/wait/avoid/unknown`）、`verdictColor`、`verdictHeadline`、`targetPrice: number | null`、`stopPrice: number | null`。
- `verdictMap(symbols)`：**一次** `stockDailyPrice.findMany({ where: { symbol: { in } } })` 取回所有關注股日線，記憶體內依 symbol 分組 → 對每組呼叫 `computeKdVerdict()` → `Map<symbol, { level, color, headline }>`（資料不足者回 unknown/gray）。避免 N+1。
- `watchTargetsMap(memberId, symbols)`：`alert.findMany({ where: { memberId, symbol: { in }, type: { in: ['PRICE_ABOVE','PRICE_BELOW'] }, isActive: true } })` → `Map<symbol, { targetPrice, stopPrice }>`（同 type 多筆取最近一筆）。
- `listWatchlistOverview(memberId)`：`Promise.all([nameMap, priceMap, scoreMap, verdictMap, watchTargetsMap])` 後組裝為 `WatchlistOverviewDto[]`，回傳 `ApiResult`。
- `setWatchTargets(memberId, symbol, { targetPrice, stopPrice })`：驗證 symbol 與數值（`Number.isFinite` 或 null）；對 `PRICE_ABOVE`（target）與 `PRICE_BELOW`（stop）各自：值為 null → 刪除該 member/symbol/type 既有 active alert；有值 → 取最近一筆更新 `threshold`，無則 `create`。回傳更新後的 `{ targetPrice, stopPrice }`。回 `ApiResult`，不 throw。

### admin — API routes

- `watchlist/overview/route.ts`：`GET = withPermission(STOCK_SIGNAL_VIEW, ...)`，取 session memberId（無則 `UNAUTHORIZED`），轉發 `listWatchlistOverview`。
- `watchlist/targets/route.ts`：`PUT = withPermission(STOCK_WATCH_MANAGE, ...)`，解析 `{ symbol, targetPrice, stopPrice }`（型別守衛，缺值→ `VALIDATION_ERROR`），轉發 `setWatchTargets`。

### admin — `page.tsx`（新頁）

- `'use client'`。沿用 console 的 `apiGet`/`apiPost` 模式，另加 `apiPut`。
- 狀態：`rows`（overview）、`sortKey`/`sortDir`、`filter`、批次訊息、編輯中的目標/停損價。
- 頂部：`StockCombobox` 加入關注；「全部分析」「全部研究」按鈕（逐檔呼叫 `/api/v1/stock/analyze`、`/api/v1/stock/reports/generate`，含進度訊息與節流，完成後 `refresh()`）。
- 排序/篩選列：排序鍵（漲跌%/評分/代號）、方向；篩選 chips（全部/評分高/評分低/今日漲/今日跌）。資料於前端 `useMemo` 計算，不打 API。
- 表格欄位：代號/名稱、最新價、漲跌%（紅漲綠跌）、評分（著色沿用）、**紅綠燈結論**（色點 + 一句話）、**目標價/停損價**（inline 可編輯，blur/Enter 觸發 PUT）、操作（分析/研究/詳情/移除）。
- 空清單顯示「尚無關注股」。

### admin — 路由 / 選單 / i18n

- `routes.ts`：`stockBot.watchlist = '/stock-bot/watchlist'`。
- `menu-items.tsx`：於 `stockConsole` 後插入「關注清單」（icon `PiStarDuotone` 或既有 import 之一；`requiredPermission: STOCK_SIGNAL_VIEW`）。
- 兩個 locale 新增 `stockWatchlist`（zh-TW:「關注清單」；en:「Watchlist」）。

## API 合約

| 端點 | 方法 | 權限 | 請求 | 回應 `data` |
| --- | --- | --- | --- | --- |
| `/api/v1/stock/watchlist/overview` | GET | `STOCK_SIGNAL_VIEW` | — | `WatchlistOverviewDto[]` |
| `/api/v1/stock/watchlist/targets` | PUT | `STOCK_WATCH_MANAGE` | `{ symbol, targetPrice: number\|null, stopPrice: number\|null }` | `{ symbol, targetPrice, stopPrice }` |

> 既有端點沿用（不改）：`POST /api/v1/stock/watchlist`、`DELETE /api/v1/stock/watchlist/:id`、`POST /api/v1/stock/analyze`、`POST /api/v1/stock/reports/generate`。

## 回滾計劃

1. 移除新增的 2 個 route 檔與 `watchlist/page.tsx`。
2. 回退 `stock-service.ts`、`routes.ts`、`menu-items.tsx`、兩個 locale 至上一版本。
3. 無 DB 變更，無需 down migration。已設定的目標/停損價即既有 Alert，回退前端後仍由 worker 正常運作（不孤兒）。

## 預期測試結果

- [x] `npm run type:check` 通過（admin + worker）— 2026-06-07 實測通過
- [x] 選單出現「關注清單」，點擊進入 `/stock-bot/watchlist`（menu-items + routes + i18n 已接）
- [x] 排序/篩選即時生效（純前端 `useMemo`）
- [x] 設定目標價 → 產生 `PRICE_ABOVE` alert；清空 → 刪除；停損價對應 `PRICE_BELOW`（`upsertPriceAlert` 實作）
- [x] 紅綠燈結論與個股詳情/Console 的 KD 結論一致（共用 `computeKdVerdict`）
- [x] 一鍵全部分析/研究逐檔送出且有進度提示（`batchRun` 含節流 + 進度訊息）

> 待手動 runtime 驗證（需登入 + 實際資料）：目標/停損價 DB 落庫、到價 LINE 推播、批次觸發後自動刷新。

## 風險評估

- 關注清單為使用者精選、數量小；`verdictMap` 改為單次 `in` 查詢 + 記憶體分組，避免 N+1。
- 目標/停損價複用 Alert：若使用者先前已於 Console 警報面板手動建多筆同 type alert，watchlist 以「最近一筆」為準顯示/更新，不刪除其餘；於 Spec 與 UI 註明此語意。
- 一鍵批次觸發逐檔呼叫既有 API，數量小可接受；UI 加節流與進度提示避免誤解。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 Edit/Write 的檔案路徑 -->

## Bug Log

{開發過程中遇到的 Bug}

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

關注清單升級為獨立頁並加入選單，附加排序/篩選、一鍵全部分析/研究、KD 紅綠燈結論欄、目標/停損價到價提醒四項。

### 關鍵問答

#### 「額外做一些」要做哪些？

**AI 回應摘要**: 提供四選項多選（排序篩選 / 一鍵批次 / 紅綠燈欄 / 目標價提醒）+ 頁面方式單選，使用者四項全選、採「獨立頁 + 選單入口」。

#### 目標價提醒是否要動資料庫？

**AI 回應摘要**: 原評估需新增 Watchlist 欄位（標 ⚠️）；實查後發現 Alert 引擎已支援 PRICE_ABOVE/PRICE_BELOW 且 worker 已自動檢查推播，改為複用 Alert，**取消資料庫異動**，任務由大型降為中型（純 admin、僅 Spec）。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 目標/停損價複用 Alert（PRICE_ABOVE/PRICE_BELOW）而非 Watchlist 新增欄位 | ✅ 採納 | 零 schema 異動、單一真實來源、自動接上既有 worker LINE 推播 |
| verdict 於 service 端以單次 `in` 查詢計算 | ✅ 採納 | 避免逐檔 getKline 的 N+1，且結論與既有 KD 卡一致 |
| 一鍵批次沿用單檔 API 逐檔呼叫，不新增 batch endpoint | ✅ 採納 | 關注數量小，複用既有端點最省成本 |

### 產出摘要

本次（2026-06-07）實作的核心檔案（上方部分 hook 自動追加項屬其他 spec 的雜訊，以下為本任務實際產出）：

| 檔案 | 動作 | 重點 |
| --- | --- | --- |
| `admin/src/lib/stock-service.ts` | 修改 | 新增 `WatchlistOverviewDto`、`verdictMap()`（單次 `in` 查詢 + 記憶體分組算 KD verdict，避免 N+1）、`watchTargetsMap()`、`listWatchlistOverview()`、`setWatchTargets()` + private `upsertPriceAlert()`（PRICE_ABOVE=目標 / PRICE_BELOW=停損 的 upsert/clear） |
| `admin/src/app/api/v1/stock/watchlist/overview/route.ts` | 新增 | GET，`STOCK_SIGNAL_VIEW` |
| `admin/src/app/api/v1/stock/watchlist/targets/route.ts` | 新增 | PUT，`STOCK_WATCH_MANAGE`，price 型別守衛（number / null / 非法 undefined） |
| `admin/src/app/(dashboard)/stock-bot/watchlist/page.tsx` | 新增 | 獨立頁：加入框 + 一鍵全部分析/研究（節流 + 進度）+ 排序/篩選（純前端 `useMemo`）+ 行情/評分/紅綠燈/目標停損 inline 編輯表格 |
| `admin/src/config/routes.ts` | 修改 | `stockBot.watchlist` |
| `admin/src/layouts/hydrogen/menu-items.tsx` | 修改 | 「關注清單」選單項（`PiStarDuotone`，`STOCK_SIGNAL_VIEW`） |
| `admin/src/locales/{zh-TW,en}.json` | 修改 | `admin.menu.stockWatchlist`（關注清單 / Watchlist） |

技術取捨：KD verdict 顏色由 `verdict.level` 推導（buy→green / wait→yellow / avoid→red / unknown→gray），與既有 `KdVerdict` 型別一致；Map 迭代改 `forEach` 以相容 admin tsconfig target（避免 `--downlevelIteration`）。
