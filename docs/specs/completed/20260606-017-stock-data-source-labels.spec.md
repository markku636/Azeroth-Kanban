# 股票機器人 — 全站數據標示「資料來源 + 日期」

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成（程式碼完成 + type:check 通過 + 對抗式審查；實機視覺待確認）
> 關聯計劃書: 無（橫跨全站的 UI 透明度增強，單一 admin 子專案）

---

## 目標

讓後台所有顯示「外部數據」的區塊，都在資料旁以**純文字**標示**資料來源**（FinMind / 證交所 TWSE / AI Claude / 本系統計算），若該數據有日期則**一併顯示資料日期**。提升數據透明度，讓使用者一眼知道「這個數字哪來的、是哪天的」。

需求確認（使用者）：
- 範圍：**全站所有外部數據**（個股詳情頁、大盤、選股器、關注清單即時行情、console 各區塊…）
- 互動：**只要顯示文字即可**（不需可點擊連結）
- 加碼：**有日期就順便顯示日期**

## 背景

目前全站僅 `/stock-bot/about` 用靜態表格集中說明來源；各數據區塊本身**沒有任何來源標示**。日期則零散：K 線、籌碼、大盤、訊號、新聞已顯示日期，但基本面、健診評分、關注清單、選股器無日期。本案統一補齊。

> 實際資料來源僅 3 類：**FinMind**（K 線/籌碼/基本面/新聞/股名）、**TWSE 證交所 OpenAPI**（漲幅排行/加權指數/類股）、**Claude AI**（研究報告/問答；不提供原始數據）。其餘（訊號/評分/選股器）為**本系統**基於上述數據計算而得。LINE 僅為推播通道、非資料來源。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | **無 DB schema 變更**（要顯示的日期皆已存在 DB，只是未帶到前端） |
| `common` | ❌ | 無共用型別變更 |
| `admin` | ✅ | 新增中央來源設定 + 共用標籤元件；service 補 3 處日期欄位；多個頁面掛上標籤 |

---

## 受影響檔案

### admin — 新增

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/config/data-sources.ts` | 新增 | 中央來源登錄：`DataSourceKey` + `DATA_SOURCES` 對照（label/說明），同時供 about 頁與標籤元件引用（單一真實來源） |
| `admin/src/components/stock/data-source-tag.tsx` | 新增 | 共用 `<DataSourceTag source date />` 小元件，渲染「資料來源：X ｜ 資料日期：YYYY-MM-DD」 |

### admin — 修改（前端頁面 / 元件）

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 修改 | 籌碼 / 基本面 / 健診評分 / 關注清單 / 最新訊號 / 研究報告 各區塊掛上標籤 |
| `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` | 修改 | 頂部報價 + 籌碼 / 基本面 / 訊號 / 報告 / 新聞 各 tab 掛上標籤 |
| `admin/src/app/(dashboard)/stock-bot/market/page.tsx` | 修改 | 加權指數 / 漲跌家數 / 類股輪動掛上標籤（證交所 TWSE） |
| `admin/src/app/(dashboard)/stock-bot/screener/page.tsx` | 修改 | 選股器表格掛上標籤（本系統評分・數據 FinMind + 資料日期 asOf） |
| `admin/src/app/(dashboard)/stock-bot/console/StockVerdictCard.tsx` | 修改 | 既有「資料截至 {asOf}」一行併入來源（FinMind） |
| `admin/src/app/(dashboard)/stock-bot/console/KlineChart.tsx` | 修改 | 圖例區補一行來源（FinMind）；日期沿用既有 K 線 |
| `admin/src/app/(dashboard)/stock-bot/about/page.tsx` | 修改 | 改為從 `data-sources.ts` 讀取來源清單，消除重複硬編碼 |

### admin — 修改（service：補可顯示的日期欄位）

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-service.ts` | 修改 | `getFundamental` 回傳補 `scoreDate`；`listWatchlist`/`priceMap` 補 `priceDate`；`getScreener` 補 `asOf`（皆取自既有 DB 欄位 `analysisSignal.createdAt` / `stockDailyPrice.tradeDate`） |

> API route 檔（`admin/src/app/api/v1/stock/.../route.ts`）僅原樣轉發 service 的 `ApiResult.data`，新增欄位自動帶出，**無需改 route**。

### 不納入範圍（明確排除 + 理由）

| 區塊 | 排除理由 |
| --- | --- |
| `monitor/page.tsx`（Worker/Job/佇列/排程） | 屬**內部系統狀態**（BullMQ 佇列、心跳、job 紀錄），非外部市場數據，且已自帶時間戳 |
| `console/AlertsPanel.tsx`（警報） | 門檻為**使用者自設**、觸發時間為系統產生，非外部數據來源 |
| `console/StockCombobox.tsx`（代號下拉） | 純輸入元件，不顯示市場數據 |

---

## 設計

### 1. 中央來源登錄 `admin/src/config/data-sources.ts`

```ts
export enum DataSourceKey {
  FINMIND = 'FINMIND',
  TWSE = 'TWSE',
  AI_CLAUDE = 'AI_CLAUDE',
  SYSTEM_SCORE = 'SYSTEM_SCORE',   // 本系統多因子評分 / 訊號（基於 FinMind/TWSE）
}

interface DataSourceMeta {
  label: string;        // 標籤主文字，例：'FinMind'
  baseNote?: string;    // 計算類來源的底層數據說明，例：'基於 FinMind 數據'
}

export const DATA_SOURCES: Record<DataSourceKey, DataSourceMeta> = {
  [DataSourceKey.FINMIND]: { label: 'FinMind' },
  [DataSourceKey.TWSE]: { label: '證交所 TWSE' },
  [DataSourceKey.AI_CLAUDE]: { label: 'AI（Claude）分析', baseNote: '數據來源：FinMind / 證交所' },
  [DataSourceKey.SYSTEM_SCORE]: { label: '本系統評分', baseNote: '基於 FinMind / 證交所數據' },
};
```

`about/page.tsx` 既有的詳細資料集表格（dataset/note）一併移入此檔（例如 `SOURCE_TABLE`），讓 about 頁與標籤共用同一份來源定義。

### 2. 共用元件 `admin/src/components/stock/data-source-tag.tsx`

```tsx
interface DataSourceTagProps {
  source: DataSourceKey;
  date?: string | null;     // YYYY-MM-DD 或可讀字串；無則只顯示來源
  className?: string;
}
// 渲染：「資料來源：FinMind ｜ 資料日期：2026-06-05」
// 樣式：text-xs text-gray-400（低調，置於區塊下緣）；有 baseNote 時以括號補底層數據
```

### 3. 各區塊來源 / 日期對照

| 區塊 | 來源 Key | 日期欄位 | 日期需後端補？ |
| --- | --- | --- | --- |
| K 線 / OHLCV | FINMIND | `points[last].date` | 否 |
| 看圖小幫手卡 | FINMIND | 既有 `asOf` | 否 |
| 籌碼（融資券/外資） | FINMIND | `summary.date` | 否 |
| 基本面（營收/EPS/PER/殖利率） | FINMIND | `fundamental.revenuePeriod` | 否 |
| 健診評分 / 多因子 | SYSTEM_SCORE | `scoreDate` | **是**（補 `analysisSignal.createdAt`） |
| 最新訊號 BUY/SELL | SYSTEM_SCORE | `createdAt` | 否 |
| 研究報告 | AI_CLAUDE | `createdAt` | 否（已在回應，前端未渲染） |
| 個股新聞 | FINMIND | `date`（每則另含媒體 source） | 否 |
| 關注清單即時行情 | FINMIND | `priceDate` | **是**（補 `stockDailyPrice.tradeDate`） |
| 選股器 / 飆股雷達 | SYSTEM_SCORE | `asOf` | **是**（補最新 `analysisSignal.createdAt`） |
| 加權指數 / 類股輪動 | TWSE | `date` | 否 |
| 漲跌家數 | TWSE | `date` | 否 |

---

## 邏輯變更點

### admin（service）
- `listWatchlist` / `priceMap`：`priceMap` 的 select 增加 `tradeDate`，回傳 map 帶 `priceDate`；`WatchlistDto` 增 `priceDate: string | null`。
- `getFundamental`：回傳物件增 `scoreDate: latestSignal?.createdAt ?? null`（轉 `YYYY-MM-DD`）。
- `getScreener`：取各 symbol 最新 signal 時，回傳整體 `asOf`（最新一筆 `createdAt`，轉 `YYYY-MM-DD`）。輸出由純陣列改為 `{ rows, asOf }` 或於每列附 `asOf`（實作時取較不影響前端的形式，於本 Spec 開發階段定）。

### admin（前端）
- 新增 `data-sources.ts`、`data-source-tag.tsx`。
- 各頁面在對應區塊末尾插入 `<DataSourceTag .../>`；同步更新各頁本地 fetch 型別以含新增日期欄位。
- `about/page.tsx` 改 import 中央設定。

## API 合約（service 回傳形狀微調，經既有 route 原樣轉發）

| 端點 | 方法 | 回應格式變更 |
| --- | --- | --- |
| `/api/v1/stock/fundamental` | GET | data 增 `scoreDate: string \| null` |
| `/api/v1/stock/watchlist` | GET | 每列增 `priceDate: string \| null` |
| `/api/v1/stock/screener` | GET | 增整體 `asOf: string \| null`（形狀調整，前端配合） |

> 皆為**新增可選欄位**，向後相容；現有欄位不動。

## 回滾計劃

1. 移除 `data-sources.ts`、`data-source-tag.tsx` 兩個新檔。
2. 還原各頁面 / `stock-service.ts` 的標籤與日期欄位變更（git revert 本 Spec 對應 commit）。
3. 無 DB、無依賴變更，回滾零風險。

## 預期測試結果

- [x] `npm run type:check` 通過（admin + worker 全綠）
- [x] （程式碼審查確認）console 各區塊（籌碼/基本面/評分/關注清單/訊號/報告）皆掛標籤 — 實機視覺待使用者確認
- [x] （程式碼審查確認）個股詳情頁各 tab、market、screener、KlineChart、VerdictCard 皆掛標籤 — 實機視覺待使用者確認
- [x] 無日期只顯示來源、不顯示「資料日期：—」殘影（已修 detail 報價 header blocker）
- [x] about 頁改用中央設定（同一份 `DATA_SOURCE_TABLE`），內容不變

## 風險評估

- 標籤過多可能視覺雜亂 → 統一 `text-xs text-gray-400`、置於區塊下緣、低調呈現。
- `getScreener` 回應形狀調整需同步前端解析，避免破壞既有表格渲染（開發時以「附 asOf、保留陣列」優先）。
- 日期格式統一 `YYYY-MM-DD`；基本面用 `revenuePeriod`（如 `2026-04`）語意為「資料月份」，標籤文字改為「資料月份」以免誤導。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認
全站外部數據區塊以純文字標示「資料來源」，有日期則一併顯示；不需可點擊連結。

### 關鍵問答

#### 範圍與互動
**AI 回應摘要**: 經提問確認 → 範圍＝全站所有外部數據；互動＝純顯示文字；加碼＝有日期就顯示。據此盤點出 3 類真實來源 + 本系統計算，採「中央來源設定 + 共用標籤元件」避免硬編碼分散。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 中央 `data-sources.ts` + 共用 `<DataSourceTag>` | ✅ 採納 | 避免來源字串散落各頁（coding-standards §六/§十一），about 頁亦共用 |
| 後端補 3 處日期（評分/關注清單/選股器） | ✅ 採納 | 日期已存在 DB，僅未帶到前端；符合「有日期就顯示」 |
| 純前端不動後端 | ❌ 棄用 | 評分/關注清單/選股器無日期可顯示，無法滿足需求 |
| 納入 monitor / 警報 | ❌ 棄用 | 屬內部系統狀態 / 使用者自設，非外部市場數據 |

### 產出摘要

**地基（主執行緒）**
- 新增 `admin/src/config/data-sources.ts`：`DataSourceKey`（FINMIND/TWSE/AI_CLAUDE/SYSTEM_SCORE）+ `DATA_SOURCES` 顯示對照 + `DATA_SOURCE_TABLE`（about 頁共用，含「本系統計算」「AI」兩列新增說明）。
- 新增 `admin/src/components/stock/data-source-tag.tsx`：`<DataSourceTag source date dateLabel className />`，date 為 null 時只顯示來源（不印殘影）。
- `admin/src/lib/stock-service.ts`：`priceMap` 補 `priceDate`（select 加 `tradeDate`）→ `WatchlistDto.priceDate`；`getFundamental` 補 `scoreDate`（取 `analysisSignal.createdAt`）；`getScreener` 改回 `{ rows, asOf }`（asOf＝最新訊號日）。
- `about/page.tsx` 改吃 `DATA_SOURCE_TABLE` 並移除冗餘 `'use client'`；`StockVerdictCard.tsx` 既有「資料截至」併入「資料來源：FinMind」；`screener/page.tsx` 配合新形狀 + 掛 SYSTEM_SCORE 標籤。

**前端接線（workflow 平行 4 檔 + 逐檔對抗式審查）**
- `console/page.tsx`：6 區塊掛標籤；新增 `WatchItem.priceDate`、`scoreDate` state、`watchlistLatestDate`（reduce 取最新 priceDate）。
- `stock/[symbol]/page.tsx`：報價 header + 6 tab；`scoreDate` state、`reportDate` useMemo。
- `market/page.tsx`：頁面級 TWSE 標籤（去除重複的第二條）。
- `console/KlineChart.tsx`：圖例列補純文字「資料來源：FinMind」span。

**審查修正**
- 🔴 detail 報價 header 原硬印「資料截至 —」→ 改條件渲染（無日期不顯示）。
- console 報告標籤 103 字元 → 拆多行符合 printWidth 100。
- market 兩條一模一樣標籤 → 保留頁面頂部一條。

**驗證**：`npm run type:check` admin + worker 全綠；4 檔經獨立 adversarial 審查（console/market/KlineChart `ok`，detail blocker 已修）。

**留意**：實機視覺驗證尚未執行（需 dev server + DB 有資料）；lint/format 工具鏈於 next16 升級後失效，本次以 type:check 把關（見 memory：lint-format-toolchain-broken）。
