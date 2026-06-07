# 股票機器人 — K 線圖「立即分析」鈕 + ETF 加入掃描池

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: 無

---

## 目標

解決「在 Console K 線圖切換到尚未分析過的股票（如 0050）時只顯示『請先分析』卻無從分析」的 UX 缺口，並讓常見 ETF 被背景掃描池自動涵蓋：

1. K 線圖區塊新增「立即分析」按鈕，對當前選定代號觸發分析，約 10 秒後自動重載圖表。
2. 將熱門 ETF（0050 / 0056 / 00878 / 006208）加入 `STOCK_POOL`，讓每日選股掃描自動抓取其日 K 與評分。

## 背景

使用者於 Console 將 K 線圖切換到 `0050` 時無資料。根因：背景 Job 只掃 [`worker/src/data/pool.ts`](../../../worker/src/data/pool.ts) 的 `STOCK_POOL`（44 檔權值股，不含 ETF），而 K 線下拉是用全市場名稱清單產生，因此選得到 0050 但 `stock_daily_price` 無資料；K 線區又只有「關注清單」列才有「分析」鈕，非關注股無法觸發分析。

`processAnalysis` → `loadKline` 會向 FinMind `TaiwanStockPrice` 抓取（支援 0050）並回填 `stock_daily_price`，故觸發分析即可補資料。ETF 無基本面（EPS/PER），但 `processAnalysis` 對基本面/評分已包 try/catch，缺值不影響 K 線與技術訊號。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema 變更 |
| `common` | ❌ | 無共用型別變更 |
| `admin` | ✅ | Console K 線區新增「立即分析」按鈕與觸發邏輯 |
| `worker` | ✅ | `STOCK_POOL` 加入熱門 ETF |

## 建議開發順序

1. `worker` — `pool.ts` 加入 ETF（設定值層級）
2. `admin` — `console/page.tsx` 加分析鈕

---

## 受影響檔案

### worker

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/data/pool.ts` | 修改 | `STOCK_POOL` 加入 0050 / 0056 / 00878 / 006208 熱門 ETF |

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 修改 | K 線區工具列加「立即分析」按鈕，觸發 `/api/v1/stock/analyze` 後延遲重載圖表 |

---

## 邏輯變更點

### worker

- `pool.ts`：於 `STOCK_POOL` 陣列尾端追加 ETF 區段（0050 元大台灣50、0056 元大高股息、00878 國泰永續高股息、006208 富邦台50），並更新檔案註解說明已含 ETF。

### admin

- `console/page.tsx`：新增 `analyzeChart()`，對 `chartSymbol` 呼叫 `apiPost('/api/v1/stock/analyze', { symbol })`，成功後以 `setChartMsg` 顯示進度，`setTimeout` 約 10 秒後 `void loadChart(chartSymbol)` 重載；失敗則顯示錯誤訊息。
- 於 K 線區工具列（日/週/月切換之後）新增「立即分析」按鈕，`onClick={analyzeChart}`，對任何選定代號皆可用（無資料時補資料、有資料時重新分析）。

## 回滾計劃

1. 回退 `console/page.tsx` 至上一版本（移除 `analyzeChart` 與按鈕）
2. 回退 `pool.ts`（移除 ETF）

## 預期測試結果

- [ ] Console 切換到 0050 → 點「立即分析」→ 約 10 秒後 K 線出現
- [ ] 對已有資料的股票（2330）點「立即分析」可重新分析、圖表刷新
- [ ] 觸發失敗（如缺權限/Redis）顯示可讀錯誤訊息，不靜默
- [ ] `npm run type:check` 通過（admin + worker）

## 風險評估

- 前端按鈕沿用既有 `apiPost` / `analyze` pattern，無新依賴
- ETF 無基本面資料，評分可能偏技術面；已由 `processAnalysis` try/catch 容錯
- 加入掃描池會略增 FinMind 請求量（+4 檔/次），在免費額度內

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

修補 K 線圖切換到未分析股票（0050）無法分析的 UX 缺口，並讓熱門 ETF 被掃描池涵蓋。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 先以一次性 enqueue 分析補上 0050 即時資料 | ✅ 採納 | 使用者要求眼前畫面馬上有圖 |
| K 線區加常駐「立即分析」鈕（而非僅無資料時顯示） | ✅ 採納 | 一鈕同時涵蓋「補資料」與「重新分析」，邏輯最單純 |
| 熱門 ETF 加入 `STOCK_POOL` | ✅ 採納 | 讓每日掃描自動覆蓋，避免日後重蹈覆轍 |

### 產出摘要

- 即時補資料：對 `0050` enqueue 一次性 analysis job（worker 已消化），`stock_daily_price` 新增 125 筆（2025-11-26 ~ 2026-06-05），訊號 HOLD / 評分 59。重整 Console 切到 0050 即有圖（純資料，無需 rebuild）。
- `worker/src/data/pool.ts`：`STOCK_POOL` 追加熱門 ETF `0050 / 0056 / 00878 / 006208`，每日選股掃描自動涵蓋。
- `admin/.../console/page.tsx`：新增 `analyzeChart()` 與 K 線區「立即分析」按鈕（常駐，任何選定代號皆可觸發，約 10 秒後自動重載圖表）。
- `npm run type:check` 通過（admin + worker 皆無錯誤）。
- 部署提醒：按鈕（admin 映像）與 ETF 掃描（worker 映像）屬程式碼變更，需 rebuild/重啟對應容器後生效；0050 即時資料已生效。
