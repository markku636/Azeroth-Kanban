# 個股詳情頁 — 新增「策略」分頁（多策略即時訊號 + 回測績效）

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: `C:/Users/a4756/.claude/plans/quizzical-herding-stearns.md`（已核准）
>
> 完成摘要：admin 3 workspace `type:check` 全綠；新 API route `/api/v1/stock/strategy-analysis`
> 經 dev(3011) 編譯回 401（權限守衛正常、無 import 錯誤）。同步複用 common 回測引擎，零佇列。

---

## 目標

在個股詳情頁（`/stock-bot/stock/[symbol]`）新增獨立的「**策略**」分頁，
對 5 個內建技術策略（KD 黃金交叉 / 均線交叉 / MACD / RSI / 布林通道）一次性呈現：
1. **即時訊號** — 每個策略最近一次（含今日）的 買進 / 賣出 / 觀望（紅綠燈 + 白話）
2. **歷史回測績效** — 每個策略對這檔的 勝率 / 總報酬 vs 買進持有 / 交易次數 / 最大回撤

## 背景

現有技術頁只有 KD 紅綠燈卡 + K 線圖 + 趨勢動能指標，看不到「各策略現在分別怎麼說、歷史上靈不靈」。
回測引擎 `runStrategyBacktest()` 與各策略 `generateSignals()` 皆為 `common/` 純函式，
`StockOhlcv` 與 `stockDailyPrice` 資料列一一對應，故 admin 可**同步、零佇列**地對 5 策略各跑一次，一次 API 回傳。

> 參考知識：複用 `common/src/backtest/registry.ts`（多策略回測註冊表，spec 20260607-014 已建立）。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema 變更（只讀 `stockDailyPrice`） |
| `common` | ❌ | 純複用既有 exports（`listStrategyMeta` / `getStrategy` / `runStrategyBacktest` / `clampParams` / `DEFAULT_COMMON_PARAMS`） |
| `admin` | ✅ | 新增 service 函式 + API route + 前端分頁與面板元件 |

## 建議開發順序

1. `admin` — service → API route → 前端面板 → 詳情頁掛載

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-service.ts` | 修改 | 新增同步函式 `getStrategyAnalysis(symbol)` + 回傳型別 |
| `admin/src/app/api/v1/stock/strategy-analysis/route.ts` | 新增 | GET，`withPermission(STOCK_SIGNAL_VIEW)`，轉發 service |
| `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/StrategyAnalysisPanel.tsx` | 新增 | 多策略面板元件（載入 + 紅綠燈 badge + 績效表） |
| `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` | 修改 | TabKey/TABS 加 `strategy`、TAB_GUIDE_KEYS、掛載面板 |

---

## 邏輯變更點

### admin — `stock-service.ts`
- `getStrategyAnalysis(symbol)`：`isValidSymbol` 防呆 → 讀 `stockDailyPrice`（無資料回 `NOT_FOUND`）→ map `StockOhlcv[]`。
  對 `listStrategyMeta()` 每策略：`clampParams` → `getStrategy(id).generateSignals()` 取最近一筆非 null 訊號（action/barsAgo/freshToday/signalDate）；`runStrategyBacktest()` 取 stats 摘要（各策略 try/catch，失敗 stats:null）。回傳 `ApiResult`（不 throw）。

### admin — 前端
- 新分頁元件：載入 API → 表格列（策略名 TermLabel + 訊號 badge + 勝率/報酬/交易次數）+ DataSourceTag + 回測期間 + 免責。
- `page.tsx`：`TabKey` 加 `'strategy'`、`TABS` 插入、`TAB_GUIDE_KEYS.strategy` 補名詞、掛載 `<StrategyAnalysisPanel>`。

## API 合約

| 端點 | 方法 | 請求 | 回應 |
| --- | --- | --- | --- |
| `/api/v1/stock/strategy-analysis` | GET | `?symbol=` | `ApiResult<{ name, dataDate, periodStart, rows: StrategyAnalysisRow[] }>` |

## 回滾計劃

1. 移除新檔（route / panel）。
2. 還原 `page.tsx`、`stock-service.ts` 的新增段落。
3. 無 DB 變更，無需 down migration。

## 預期測試結果

- [ ] `npm run type:check` 通過
- [ ] 詳情頁「策略」分頁顯示 5 策略訊號 + 績效，顏色（漲紅跌綠）正確
- [ ] 與「回測這檔」同策略/同參數數字吻合
- [ ] 資料不足 / 查無代號 不 crash，顯示對應提示

## 風險評估

- 同步回測對極長序列的 CPU 成本：5 策略 × 數百根 K 棒可忽略，無風險。
- 與既有 worker 佇列回測共用同一 `common` 引擎，數字一致性有保證。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

{開發過程中遇到的 Bug}

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

使用者於技術頁要求「用各種策略來分析這檔股票」，經 AskUserQuestion 確認：**即時訊號 + 回測績效兩者都要**，放在**新增的獨立「策略」分頁**。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 同步 in-process 跑回測（不走 worker 佇列） | ✅ 採納 | 引擎為純函式，5 策略成本可忽略，免輪詢、UX 即時 |
| 使用各策略 `defaultParams`，不開放調參 | ✅ 採納 | 調參需求已由「回測這檔 / 比較策略」頁覆蓋，本頁聚焦快速總覽 |

### 產出摘要

- `stock-service.ts`：新增 `getStrategyAnalysis(symbol)` — 讀 `stockDailyPrice` → `StockOhlcv[]`，
  對 `listStrategyMeta()` 每策略 `generateSignals()`（`summarizeLatestSignal` 取最近一筆非 null）+ `runStrategyBacktest()`（各策略 try/catch，失敗 stats:null）。
- 新 API route + `StrategyAnalysisPanel.tsx`（表格：策略 / 目前訊號紅綠燈 / 勝率 / 總報酬 vs 買進持有 + 最大回撤/夏普 / 交易次數）。
- `page.tsx`：TabKey/TABS/TAB_GUIDE_KEYS 加 `strategy` 並掛載面板。
- 驗證：`type:check` 全綠；route 回 401（守衛正常）。
- 取捨：`actionVerdict` 無 WAIT 分支 → 前端以 `'HOLD'` 正規化取得中性色彩。
- `admin/src/app/api/v1/stock/strategy-analysis/route.ts` — Write @ 2026-06-07 10:02
- `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/StrategyAnalysisPanel.tsx` — Write @ 2026-06-07 10:03
- `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` — Edit @ 2026-06-07 10:03
- `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/StrategyAnalysisPanel.tsx` — Edit @ 2026-06-07 10:05
