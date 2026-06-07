# 股票機器人 — 關注清單優化（名稱顯示完整 + 即時行情總覽）

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: 無

---

## 目標

後台 Console（`/stock-bot/console`）的「關注清單」：
1. **名稱顯示完整** — 比照 K 線圖，從 `StockInfo` 主檔解析中文名（單一真實來源），修好現有與未來的關注股。
2. **即時行情總覽** — 每列補上「最新收盤價、漲跌%（紅漲綠跌）、健診評分」，把清單變成一眼看完盤勢的表格。

## 背景

`listWatchlist()` 直接回傳 watchlist 資料表上 denormalized 的 `name` 欄位；但透過 Console 加入關注時 `addWatch` 只送 `{ symbol }`，從未寫入 name，因此該欄為 `null` → 前端只看得到代號（如 `2330`）。K 線圖標題能顯示「2330 台積電」是因為走 `getKline()` 從 `StockInfo` 查名（`stockName()`）。關注清單應比照辦理，並一併把使用者選定的「即時行情總覽」加上。資料皆取自既有資料表，**無資料庫異動**。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema / migration / seed 變更 |
| `common` | ❌ | 無共用型別變更 |
| `admin` | ✅ | service 層彙整名稱/行情/評分；Console UI 改為行情總覽表格 |

## 建議開發順序

1. `admin` — service 層（`stock-service.ts`）→ UI（`console/page.tsx`）

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-service.ts` | 修改 | `WatchlistDto` 擴充 4 欄；`listWatchlist()` 彙整 name + 行情 + 評分；新增 `priceMap` / `scoreMap` 兩個 private helper |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 修改 | `WatchItem` 介面擴充；關注清單 `<ul>` 改為行情總覽表格 |

---

## 邏輯變更點

### admin — `stock-service.ts`

- `WatchlistDto` 新增 `close: number | null`、`changePct: number | null`、`score: number | null`、`action: string | null`。
- 新增 `priceMap(symbols)` → `Map<symbol, { close, changePct }>`：每個 symbol 取 `stockDailyPrice` 最近 2 筆（`orderBy tradeDate desc, take: 2`，`Promise.all` 平行），`changePct = (close - prev) / prev * 100`（四捨五入 2 位）；prev 缺值則 null。
- 新增 `scoreMap(symbols)` → `Map<symbol, { score, action }>`：`analysisSignal` `distinct: ['symbol']` 取最新一筆（與 `getScreener()` / `getFundamental()` 同來源）。
- `listWatchlist()`：`Promise.all([nameMap, priceMap, scoreMap])` 後組裝，name 優先 `StockInfo`、fallback `r.name`。
- `addWatch()` 維持只回傳新建列，新欄位填 `null`（前端新增後 `refresh()` 重抓清單）。

### admin — `console/page.tsx`

- `WatchItem` 介面補上 `close / changePct / score / action`。
- 關注清單 `<ul>` 改為表格：代號/名稱、最新價、漲跌%、評分、操作（分析/研究/詳情/移除 行為不變）；紅漲綠跌與評分著色沿用既有慣例；外層 `overflow-x-auto`；空清單顯示「尚無關注股」。

## API 合約

| 端點 | 方法 | 請求格式變更 | 回應格式變更 |
| --- | --- | --- | --- |
| `/api/v1/stock/watchlist` | GET | 無 | `data[]` 每筆新增 `close` / `changePct` / `score` / `action`（皆可 null）；`name` 改由 StockInfo 解析 |

## 回滾計劃

1. 回退 `stock-service.ts` 與 `console/page.tsx` 至上一版本（無 DB 變更，不需 down migration）。

## 預期測試結果

- [x] `npm run type:check` 通過（admin + worker）
- [~] `npm run lint` — repo 工具鏈於 next 15→16 升級後失效（`next lint` 移除、無 prettier 設定檔），屬既有問題；本次風格與既有檔案一致
- [x] 既有關注股 `2330` 解析出「台積電」（DB 驗證：stock_info 2330→台積電；watchlist.name 原為空）
- [x] 最新價/漲跌%/評分資料齊備（DB 驗證：last2=2365,2385 → 2,365.00 ▼0.84%；score=57/HOLD）
- [x] 無日 K / 無訊號的代號對應欄位回傳 null → 前端顯示 `—`（程式邏輯保證）
- [x] admin 容器已重建並啟動（console 回 307 導向登入，路由守衛正常）

## 風險評估

- 關注清單為使用者精選、數量小，`priceMap` 採 `Promise.all` 平行小查詢可接受，不致 N+1 風險。
- 無跨專案相容性風險（僅 admin 層、無 schema 變更）。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 Edit/Write 的檔案路徑 -->

## Bug Log

{開發過程中遇到的 Bug}

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

關注清單名稱顯示不完整（只見代號），需從 StockInfo 補齊中文名；並依使用者選定加入「即時行情總覽」（最新價 + 漲跌% + 健診評分）。

### 關鍵問答

#### 「優化」要做到什麼程度？

**AI 回應摘要**: 提供三選項（加行情總覽 / 只優化排版 / 兩者皆做），使用者選「加即時行情總覽」。名稱顯示完整為共同 baseline，一併修正。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| name 於 list 時從 StockInfo 即時解析（非新增時 denormalize） | ✅ 採納 | 單一真實來源，避免 denormalized 欄位 staleness，且修好既有空名稱的關注股 |
| 行情/評分取自既有 StockDailyPrice / AnalysisSignal | ✅ 採納 | 免資料庫異動，評分與 K 線下方健診評分一致 |

### 產出摘要

- `stock-service.ts`：新增 `priceMap()`（每檔取最近 2 筆日 K 算漲跌%）與 `scoreMap()`（`analysisSignal` distinct 取最新評分/動作）兩個 private helper；`listWatchlist()` 以 `Promise.all([nameMap, priceMap, scoreMap])` 彙整，name 優先 StockInfo、fallback 既有欄位；`WatchlistDto` 擴充 `close / changePct / score / action`；`addWatch()` 回傳補上 4 個 null 欄位。
- `console/page.tsx`：`WatchItem` 介面同步擴充；關注清單 `<ul>` 改為 `<table>`（代號/名稱、最新價、漲跌%、評分、操作），紅漲綠跌與評分著色沿用既有慣例，外層 `overflow-x-auto`。
- 驗證：`npm run type:check` 通過（admin + worker）。lint / prettier 工具鏈因 repo 於 next 15→16 升級後 `next lint` 移除、且無 prettier 設定檔（fallback 預設與全 codebase 單引號風格衝突）而失效，屬既有 repo 層問題，非本次改動造成；本次程式碼風格與既有檔案一致。
- 部署：admin 為 Docker production build（無 source volume），改動需 `docker compose up -d --build admin` 重建容器後生效。
