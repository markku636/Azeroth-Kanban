# 股票機器人 — 完整支援 5/6 碼 ETF（addWatch 存在性驗證 + 擴充股池）

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: 無（延續 ETF 支援系列：spec 20260606-023、20260607-007）

---

## 目標

把「完整支援 5/6 碼 ETF」收尾。延續：
- spec 20260606-023：後端 `SYMBOL_RE` 放寬 `/^\d{4,6}$/` + `triggerAnalysis`/`triggerResearch` 加 `ensureTradableSymbol`
- spec 20260607-007：前端 `parseSymbol`/`submitRaw` 不再截斷 5/6 碼

本 Spec 補最後兩塊：
- **A**：`addWatch` 也用 `ensureTradableSymbol` 驗證代號真實存在 → 杜絕 `0073`/`9999` 之類幽靈代號加入關注清單（與分析/研究入列一致）。
- **B**：擴充選股股池 `STOCK_POOL`，加入更多旗艦高股息 ETF（5 碼），讓選股器/每日掃描開箱即覆蓋熱門 ETF。

## 背景

> 參考知識：[`docs/specs/doing/20260606-023-manual-analyze-symbol-guard.spec.md`](./20260606-023-manual-analyze-symbol-guard.spec.md)

調查「0073 沒有中文資料」時釐清的事實：

1. 每日掃描/評分的**股池 = `STOCK_POOL`（靜態種子池）∪ active watchlist**（見 `worker/src/jobs/screen.ts`、`worker/src/jobs/scheduler.ts`），**不是**全市場 TWSE 清單。
2. `STOCK_POOL` 已含 ETF（`0050`/`0056`/`00878`/`006208`），且 worker analysis 路徑（`worker/src/jobs/analysis.ts`）**無 4 碼格式守衛** → 5/6 碼 ETF 已能正常評分。
3. `worker/src/data/market.ts`（漲跌家數 breadth）、`worker/src/data/twse.ts`（飆股雷達 top-gainers）的 `/^\d{4}$/` **刻意保留**：TWSE `STOCK_DAY_ALL` 含全部證券，若放寬會把**權證（6 碼）**等灌進來；且 breadth/gainers 本就應以一般股為主。
4. 唯一缺口：`addWatch` 只做格式檢查、不驗存在 → 仍可建立幽靈關注列。

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema 變更 |
| `common` | ❌ | 沿用既有 `ApiReturnCode` / `ApiErrorCode`，不新增 |
| `admin` | ✅ | A：`addWatch` 改用 `ensureTradableSymbol` 守衛 |
| `worker` | ✅ | B：`STOCK_POOL` 擴充旗艦 ETF |

## 建議開發順序

1. `admin` — A：`stock-service.ts` 的 `addWatch`
2. `worker` — B：`pool.ts` 的 `STOCK_POOL`

## 受影響檔案

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-service.ts` | 修改 | `addWatch`：移除只做格式檢查的 `isValidSymbol` 區塊，改為入列前 `const guard = await ensureTradableSymbol(sym); if (guard) return guard;`（沿用 `triggerAnalysis`/`triggerResearch` 的既有 pattern） |
| `worker/src/data/pool.ts` | 修改 | `STOCK_POOL` 新增已驗證為真實代號的旗艦 ETF：`00929`（復華台灣科技優息）、`00940`（元大台灣價值高息）、`00919`（群益台灣精選高息）、`00713`（元大台灣高息低波） |

---

## 邏輯變更點

### A — `admin/src/lib/stock-service.ts`（`addWatch`）

- 保留空字串檢查（`請提供股票代號`）。
- 將 `if (!isValidSymbol(sym)) { ... }` 整段替換為：
  ```ts
  const guard = await ensureTradableSymbol(sym);
  if (guard) {
    return guard;
  }
  ```
- `ensureTradableSymbol` 內已含格式檢查 → 本地 `StockInfo` 命中放行 → 否則 FinMind 權威查（存在則 upsert 快取放行、查無回 `NOT_FOUND`「查無此代號 …」、網路/API 失敗降級放行）。
- 型別：`ensureTradableSymbol` 回 `ApiResult<never> | null`，`return guard` 於回傳 `ApiResult<WatchlistDto>` 的函式中合法（`never` ⊆ `WatchlistDto`），與 `triggerAnalysis` 同樣寫法。

### B — `worker/src/data/pool.ts`（`STOCK_POOL`）

- 在「熱門 ETF」區塊追加 `00929`、`00940`、`00919`、`00713`（皆已對照 TWSE 全市場快照確認存在）。
- 不改 market.ts/twse.ts 的 `/^\d{4}$/`（見背景 §3）。

## API 合約（若有 API 異動）

| 端點 | 方法 | 請求格式變更 | 回應格式變更 |
| --- | --- | --- | --- |
| 加入關注（`addWatch`） | POST | 無 | 代號不存在時改回 `NOT_FOUND`（404）+「查無此代號 …」（原本會成功建立幽靈列） |

## 回滾計劃

1. 還原 `addWatch` 的 `isValidSymbol` 格式檢查區塊、移除 `ensureTradableSymbol` 呼叫
2. 還原 `STOCK_POOL`（移除新增的 4 檔 ETF）

## 預期測試結果

- [x] `npm run type:check`（admin）通過、無錯誤
- [x] `npm run type:check`（worker）通過、無錯誤
- [ ]（待使用者於執行中 app 驗證）輸入不存在代號（如 `9999`）按 Enter 加入 → 顯示「查無此代號 9999…」，不建立關注列
- [ ]（待使用者驗證）加入真實 ETF（`00929`/`00940`）→ 正常入列
- [ ] 既有 4 碼行為不變

## 風險評估

- A 多一次 FinMind 查詢：屬使用者低頻主動操作，本地命中不打網路、失敗降級放行，風險低（與 023 同論證）。
- B 為資料追加（已驗證為真實代號），不會像幽靈碼造成每日 FAILED；僅小幅增加每日掃描檔數（+4）。

---

## 實際變更

- `admin/src/lib/stock-service.ts` — `addWatch`：以 `ensureTradableSymbol(sym)` 守衛取代純格式檢查。
- `worker/src/data/pool.ts` — `STOCK_POOL` 追加 `00929`/`00940`/`00919`/`00713`。

## Bug Log

無。

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

使用者要「完整支援 5/6 碼 ETF」並指示「依序實作」。調查後確認系統大半已支援，僅缺 addWatch 存在性驗證（A）；並把「ETF 進掃描池」正確落在擴充 `STOCK_POOL`（B）。

### 關鍵問答

#### 「worker 掃描池」要不要放寬 `/^\d{4}$/`？

**AI 回應摘要**：不要。實際掃描股池是 `STOCK_POOL ∪ watchlist`，與 market.ts/twse.ts 無關；後兩者是 breadth / top-gainers，放寬會把權證（6 碼）灌進來並扭曲市場廣度。正確做法是把要覆蓋的 ETF 加進 `STOCK_POOL`。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 放寬 `market.ts`/`twse.ts` 的 `/^\d{4}$/` | ❌ 棄用 | 那是 breadth/top-gainers，非掃描池；放寬會灌入權證、扭曲廣度 |
| `addWatch` 加 `ensureTradableSymbol` 守衛（A） | ✅ 採納 | 與分析/研究一致，徹底杜絕幽靈關注列 |
| 擴充 `STOCK_POOL` 旗艦 ETF（B） | ✅ 採納 | 掃描池=STOCK_POOL∪watchlist；加真實 ETF 即開箱覆蓋；已驗證代號存在 |
| 字母尾槓桿/反向 ETF（`00632R`，C） | ⏸ 延後 | 跨鏈正則改動、payoff 低；新手友善定位不宜推槓桿/反向；A 已讓其回「查無代號」而非幽靈列 |

### 產出摘要

- **A**：`addWatch` 改用 `ensureTradableSymbol` 守衛（沿用 `triggerAnalysis` pattern）；不存在代號回 `NOT_FOUND`「查無此代號 …」，不再建立幽靈關注列。
- **B**：`STOCK_POOL` 追加旗艦 ETF `00929`/`00940`/`00919`/`00713`（已對照 TWSE 全市場快照確認存在）。
- **刻意未改**：`market.ts`/`twse.ts` 的 `/^\d{4}$/`（breadth/top-gainers，放寬會灌入權證、扭曲廣度）。
- **驗證**：`npm run type:check`（admin、worker）皆通過、無錯誤。
- `worker/src/data/pool.ts` — Edit @ 2026-06-06 18:21
