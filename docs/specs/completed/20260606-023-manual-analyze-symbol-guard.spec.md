# 股票機器人 — 手動分析/研究代號防呆（查無代號即擋下）

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: 無

---

## 目標

手動觸發「分析 / 研究」時，先驗證代號是否為真實上市櫃標的；查無此代號就**直接回錯誤並提示使用者**，**不入列佇列**，避免像 `0073` 那樣排進去跑一圈才 FAILED（錯誤訊息「無價格資料：0073」）。

## 背景

監控頁出現連續 3 筆 `0073` analysis FAILED。根因：`0073` 不是有效代號，FinMind `TaiwanStockPrice` / `TaiwanStockInfo` 對它都回「status 200 但 0 筆」，導致 `worker/src/jobs/analysis.ts` 在 `loadKline` 取得空陣列後丟出「無價格資料」。

現況問題：

1. `triggerAnalysis` / `triggerResearch` 只做格式檢查 `SYMBOL_RE = /^\d{4}$/`，`0073` 是 4 位數字 → 格式合法 → 照樣入列 → 跑完才 FAILED，浪費佇列、且使用者看不懂錯誤。
2. 同一個 `/^\d{4}$/` 也會誤殺 5–6 位數的真實 ETF（如 `00878`、`006208`、`00733`），手動分析它們會被當成「格式錯誤」。
3. 本地 `StockInfo` 表只靠 `ensureStockName` 懶載入（`loadAllStockInfo` 未被任何排程呼叫），只含「分析過的代號」，**不是全市場權威表**；單用它驗證會誤殺「沒分析過的真實代號」。

驗證來源結論（實測）：FinMind `TaiwanStockInfo`（全市場代號表）對 `0073` 回 0 筆、對 `00733`/`0050`/`2330` 都有 → 可作為**權威**的「代號是否存在」判斷依據。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema 變更 |
| `common` | ❌ | 沿用既有 `ApiReturnCode.NOT_FOUND` 與 `ApiErrorCode.STOCK.SYMBOL_INVALID`，不新增型別/錯誤碼 |
| `admin` | ✅ | 新增 FinMind 代號查詢 helper + 在手動分析/研究入列前加驗證 |

## 建議開發順序

1. `admin` — 新增 `admin/src/lib/finmind.ts`（最小代號查詢），改 `admin/src/lib/stock-service.ts` 加驗證

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/finmind.ts` | 新增 | 最小 FinMind client：`fetchStockInfoFromFinMind(symbol)` 查 `TaiwanStockInfo`，回 `{ name, industry } \| null`，網路/ API 失敗則 `throw`（讓呼叫端決定降級） |
| `admin/src/lib/stock-service.ts` | 修改 | 新增 `ensureTradableSymbol(sym)`；於 `triggerAnalysis`、`triggerResearch` 入列前呼叫；放寬 `SYMBOL_RE` 為 `/^\d{4,6}$/` |

---

## 邏輯變更點

### admin/src/lib/finmind.ts（新增）

- `fetchStockInfoFromFinMind(symbol: string): Promise<{ name: string; industry: string \| null } \| null>`
  - 打 `GET {FINMIND_BASE_URL}?dataset=TaiwanStockInfo&data_id={symbol}`（有 `FINMIND_TOKEN` 則帶上）
  - `status !== 200` 或 `fetch` 失敗 → `throw`（網路/額度問題屬基礎設施失敗，交由呼叫端降級）
  - `data.length === 0` → 回 `null`（代號不存在）
  - 否則回第一筆的 `{ name, industry }`
  - 常數：`FINMIND_BASE_URL`、`TaiwanStockInfo` dataset 名抽為 `const`

### admin/src/lib/stock-service.ts（修改）

- `SYMBOL_RE`：`/^\d{4}$/` → `/^\d{4,6}$/`（放寬以容納 5–6 位 ETF；此為更寬鬆變更，只會「多放行」不會多擋，下游有存在性檢查與 DB 讀取兜底）
- 新增 `async function ensureTradableSymbol(sym: string): Promise<ApiResult<never> \| null>`，回傳「錯誤 ApiResult（擋下）」或 `null`（放行）。流程（Early Return）：
  1. 格式不符 `isValidSymbol` → 回 `VALIDATION_ERROR` +「股票代號格式錯誤」+ `SYMBOL_INVALID`
  2. 本地快取命中：`prisma.stockInfo.findUnique({ symbol })` 存在 → `return null`（放行，零網路）
  3. 權威查詢：`try { fetchStockInfoFromFinMind(sym) }`
     - 回物件（存在）→ `prisma.stockInfo.upsert` 順手快取名稱 → `return null`
     - 回 `null`（不存在）→ 回 `NOT_FOUND` +「查無此代號 {sym}，請確認是否為上市櫃代號」+ `SYMBOL_INVALID`
     - `catch`（網路/ API 失敗）→ `console.warn` 後 `return null`（降級放行，不因基礎設施失敗擋住使用者；worker 會再處理）
- `triggerAnalysis` / `triggerResearch`：移除原本只做格式檢查的 `if (!isValidSymbol)` 區塊，改為入列前 `const guard = await ensureTradableSymbol(symbol); if (guard) return guard;`

## API 合約（若有 API 異動）

| 端點 | 方法 | 請求格式變更 | 回應格式變更 |
| --- | --- | --- | --- |
| 觸發分析（呼叫 `triggerAnalysis`） | POST | 無 | 代號不存在時改回 `NOT_FOUND`（404）+「查無此代號 …」（原本會成功入列、之後才 FAILED） |
| 觸發研究（呼叫 `triggerResearch`） | POST | 無 | 同上 |

## 回滾計劃

1. 還原 `admin/src/lib/stock-service.ts`（`SYMBOL_RE`、`triggerAnalysis`/`triggerResearch`、移除 `ensureTradableSymbol`）
2. 刪除 `admin/src/lib/finmind.ts`

## 預期測試結果

- [x] `npm run type:check` 通過（admin + worker，無錯誤）
- [x] FinMind 實測：`0073` 回 0 筆、`2330`/`0050`/`00878`/`006208`/`00733` 皆有資料 → 驗證來源可靠
- [x] 前端 `console/page.tsx` 於 `!res.success` 顯示 `res.message`，404 訊息會呈現給使用者
- [x] route `analyze` / `reports/generate` 以 `ApiResponse.json` 轉發，code→HTTP status 正確
- [ ]（待使用者於執行中的 app 點擊驗證）手動分析 `0073` → 立刻顯示「查無此代號 0073…」，不產生佇列 job
- [ ]（待使用者驗證）手動分析 `00878` / `006208` → 正常入列（不再被誤判格式錯誤）

## 風險評估

- 放寬 `SYMBOL_RE` 會連帶影響其他使用 `isValidSymbol` 的端點（`addWatch`/`getKline`/`getChips`/`getFundamental`/`addAlert`/`getStockNews`）：皆為「多放行 5–6 位數」，屬正確行為（這些本就該支援 ETF），且下游皆有 DB 讀取/NOT_FOUND 兜底，風險低。
- 手動觸發時多一次 FinMind 網路呼叫：屬使用者主動低頻操作，且本地命中時不打網路；失敗時降級放行。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 Edit/Write 的檔案路徑 -->

## Bug Log

無（本次無踩坑）。

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

使用者於監控頁看到 `0073` analysis 連續 FAILED，要求「幫我防呆」：在手動分析/研究入列前驗證代號，查無就擋下並提示，而非排進佇列跑一圈才失敗。

### 關鍵問答

#### 用什麼當「代號是否存在」的驗證來源？

**AI 回應摘要**: 本地 `StockInfo` 表只含分析過的代號（`loadAllStockInfo` 未被排程呼叫），不可靠；改以 FinMind `TaiwanStockInfo` 為權威來源（實測 `0073` 回 0 筆、真實代號皆有）。採「本地快取命中即放行 → 否則打一次 FinMind 權威查 → 失敗則降級放行」的混合策略，兼顧正確性、效能與韌性。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 只用本地 `StockInfo` 驗證 | ❌ 棄用 | 表只含分析過代號，會誤殺沒分析過的真實代號 |
| 改排程跑 `loadAllStockInfo` 後本地驗證 | ❌ 棄用（本次） | 跨 worker，範圍過大；本次以 admin 內 FinMind 即時查解決 |
| 本地命中 + FinMind 權威 + 失敗降級 | ✅ 採納 | 正確、低延遲（命中不打網路）、基礎設施失敗不擋使用者 |
| 放寬 `SYMBOL_RE` 至 4–6 位 | ✅ 採納 | 否則真實 ETF（00878/006208）手動分析會被誤判格式錯誤 |

### 產出摘要

- `admin/src/lib/finmind.ts`（新增）：`fetchStockInfoFromFinMind(symbol)` 查 `TaiwanStockInfo`，存在回 `{ name, industry }`、查無回 `null`、網路/API 失敗 `throw`。
- `admin/src/lib/stock-service.ts`（修改）：
  - `SYMBOL_RE` `/^\d{4}$/` → `/^\d{4,6}$/`（容納 5–6 位 ETF）。
  - 新增 `ensureTradableSymbol(sym)`：格式檢查 → 本地 `StockInfo` 命中放行 → 否則 FinMind 權威查（存在則 upsert 快取放行、查無回 `NOT_FOUND`「查無此代號 …」、失敗 `console.warn` 後降級放行）。
  - `triggerAnalysis` / `triggerResearch`：入列前改呼叫 `ensureTradableSymbol`，並 `trim()` 後入列。
- 驗證：`npm run type:check` 通過；FinMind 0073 回 0 筆已實測；前端 `console/page.tsx` 既有 `!res.success → 顯示 res.message` 邏輯會呈現提示。
- 後續（不在本 Spec）：FinMind 資料約交易日凌晨才更新當日，13:50–14:30 排程實際分析前一交易日 → 另開排程時間 Spec 處理。
