# 股票機器人 — 修正前端代號截斷（5–6 碼 ETF 被砍成 4 碼）

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: 無

---

## 目標

修正 console 前端把 5–6 碼 ETF 代號截斷成 4 碼的 bug：在下拉選單選取或輸入 `00730`、`00878`、`006208` 等代號時，前端應送出**完整代號**，而非只取前 4 碼（這正是關注清單出現幽靈代號 `0073` 的直接元兇）。

## 背景

關注清單出現 `0073`（無中文名、無行情、無評分）。追查後確認 `0073` 不是真實代號 —— 它是某檔 5 碼 ETF（如 `00730 富邦臺灣優質高息`）被前端正則 `/\d{4}/`（未錨定、只取前 4 碼）截斷後的產物。

對照 FinMind 全市場快照（2026-06-05）：有 `00730 / 00731 / 00733`，但**沒有** `0073`。

現況（與既有修正的關係）：

1. 後端 `admin/src/lib/stock-service.ts` 已於 [`20260606-023-manual-analyze-symbol-guard.spec.md`](../doing/20260606-023-manual-analyze-symbol-guard.spec.md) 把 `SYMBOL_RE` 放寬為 `/^\d{4,6}$/`，並新增 `ensureTradableSymbol`，所以**手動分析/研究** `0073` 已會正確回「查無此代號」。
2. **但前端仍會截斷**：`parseSymbol`（[`console/page.tsx`](../../../admin/src/app/(dashboard)/stock-bot/console/page.tsx) 第 65–66 行）與 `submitRaw`（[`console/StockCombobox.tsx`](../../../admin/src/app/(dashboard)/stock-bot/console/StockCombobox.tsx) 第 52 行）都用 `/\d{4}/`，在送到後端前就把 `00730` 砍成 `0073`。後端再怎麼放寬都收到被截斷的碼。
3. 連帶：點關注清單中 5 碼代號去載 K 線圖（`loadChart(w.symbol)` → `parseSymbol`）也會載到錯誤代號。

> 本 Spec **只修前端截斷**。worker 掃描池（`worker/src/data/market.ts`、`worker/src/data/twse.ts` 的 `/^\d{4}$/`）與含字母尾的槓桿/反向 ETF（`00632R`、`00715L`）不在本次範圍（前者跨 worker 且與進行中的大型改造重疊；後者需 admin+worker 同步放寬正則）。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema 變更 |
| `common` | ❌ | 無型別/錯誤碼變更 |
| `admin` | ✅ | 前端 2 檔正則改錨定 4–6 碼 |

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 修改 | `parseSymbol` 的 `/\d{4}/` → `/^\d{4,6}/`（取開頭 4–6 碼，不截斷 5–6 碼 ETF） |
| `admin/src/app/(dashboard)/stock-bot/console/StockCombobox.tsx` | 修改 | `submitRaw` 的 `/\d{4}/` → `/^\d{4,6}/`（輸入後按 Enter 送出完整代號） |

---

## 邏輯變更點

### `admin/src/app/(dashboard)/stock-bot/console/page.tsx`

`parseSymbol(value)`：下拉值格式恆為「代號 名稱」（代號在前、空白分隔）或純代號，代號必為開頭 token。

- `value.trim().match(/\d{4}/)` → `value.trim().match(/^\d{4,6}/)`
- 行為：`00730 富邦臺灣優質高息` → `00730`；`2330 台積電` → `2330`；`006208` → `006208`；無法匹配時維持回傳 `value.trim()`（後端再驗證）
- 註解同步更新（移除「4 碼」字樣）

### `admin/src/app/(dashboard)/stock-bot/console/StockCombobox.tsx`

`submitRaw()`（使用者打字後按 Enter 的路徑）：

- `query.trim().match(/\d{4}/)` → `query.trim().match(/^\d{4,6}/)`
- `if (m)` 守衛與 `onSelect(m[0])` 不變（仍只在匹配成功時送出）
- 從下拉「點選」的 `pick()` 已用完整 `o.symbol`，無需改；但其下游 `parseSymbol` 修好後才會真正完整送達

> 採「錨定開頭 + 貪婪 4–6 位」：可正確涵蓋 4/5/6 碼，且不會誤抓名稱中的數字（如「元大台灣50」「中信中國50」）。

## API 合約（若有 API 異動）

無（純前端解析修正，請求/回應格式不變；後端 `SYMBOL_RE = /^\d{4,6}$/` 已相容）。

## 回滾計劃

1. 還原 `console/page.tsx` 的 `parseSymbol` 正則為 `/\d{4}/`
2. 還原 `console/StockCombobox.tsx` 的 `submitRaw` 正則為 `/\d{4}/`

## 預期測試結果

- [x] `npm run type:check` 通過（admin，無錯誤）
- [ ]（待使用者於執行中的 app 驗證）console 下拉選 `00730 / 00878 / 006208` 加入關注 → 送出完整代號、可正常顯示名稱/行情，不再產生 `0073`
- [ ]（待使用者驗證）點關注清單中 5 碼代號 → K 線圖載入正確代號
- [ ] 既有 4 碼（`2330` / `0050`）行為不變

## 風險評估

- 改為錨定開頭：理論上若下拉值「名稱在前、代號在後」會抓不到，但本專案下拉值恆為「代號 名稱」、純代號或圖表初始代號，皆以代號開頭，風險低。
- 與併發中的後端/worker 改造無檔案重疊（只動前端 2 檔），衝突風險低。

---

## 實際變更

- `admin/src/app/(dashboard)/stock-bot/console/page.tsx`：`parseSymbol` 正則 `/\d{4}/` → `/^\d{4,6}/`，註解同步更新。
- `admin/src/app/(dashboard)/stock-bot/console/StockCombobox.tsx`：`submitRaw` 正則 `/\d{4}/` → `/^\d{4,6}/`。

## Bug Log

無。

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

使用者於 console 關注清單看到 `0073`「沒有中文資料」。追查確認 `0073` 是 5 碼 ETF 被前端正則截斷的產物，要求修正（範圍選定：只先修前端截斷，不碰 worker 以避開併發中的大型改造）。

### 關鍵問答

#### 為何後端已放寬 `SYMBOL_RE`，前端仍會壞？

**AI 回應摘要**：後端（spec 023）只解決了手動分析/研究的入列驗證；但 `parseSymbol` / `submitRaw` 在前端就先用 `/\d{4}/` 截斷，後端收到的已是被砍過的 4 碼。需在前端改錨定 4–6 碼才能讓完整代號送達。

#### 為何不一起修 worker 掃描池？

**AI 回應摘要**：偵測到 `stock-service.ts`、`stock-queue.ts`、`scheduler.ts` 正被併發編輯（檔案在調查期間變動），且 worker 掃描池屬另一進行中的大型改造範圍。為避免撞車，本次只動前端 2 檔。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 完整支援 5/6 碼 ETF（含 worker 掃描池） | ⏸ 暫緩 | 與併發中的 worker 改造重疊，本次只先解前端截斷 |
| 前端正則改 `/^\d{4,6}/`（錨定開頭、貪婪 4–6 位） | ✅ 採納 | 正確涵蓋 4/5/6 碼、不誤抓名稱數字、與後端 `/^\d{4,6}$/` 一致 |
| 含字母尾 ETF（`00632R`） | ⏸ 暫緩 | 需 admin+worker 同步放寬，且後端目前不收字母尾 |

### 產出摘要

- **diff（共 2 行核心邏輯）**：`parseSymbol`（page.tsx）與 `submitRaw`（StockCombobox.tsx）的 `/\d{4}/` 皆改為 `/^\d{4,6}/`，使下拉選取／Enter 送出時保留完整 5–6 碼 ETF 代號。
- **驗證**：`npm run type:check --workspace admin`（`tsc --noEmit`）通過、無錯誤；admin workspace 整體型別狀態正常。
- **待使用者於執行中 app 驗證**：console 加入 `00730 / 00878 / 006208` → 不再產生 `0073`、可顯示名稱與行情；點 5 碼關注列 → K 線載入正確代號。眼前既有的 `0073` 壞列請點「移除」清除。
- **未涵蓋（刻意延後）**：worker 掃描池（`worker/src/data/market.ts`、`worker/src/data/twse.ts` 的 `/^\d{4}$/`）使 ETF 不進自動掃描；含字母尾 ETF（`00632R`/`00715L`）需 admin+worker 同步放寬正則。
