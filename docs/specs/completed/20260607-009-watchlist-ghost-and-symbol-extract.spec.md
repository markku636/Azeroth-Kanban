# 股票機器人 — 修正關注清單幽靈代號（0073）+ 聊天代號解析吃碼數

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: 無（延續 ETF 代號支援系列：spec 20260606-023、20260607-007、20260607-008）

---

## 目標

徹底修掉「台股代號少一碼」殘留問題，走正規做法（修根因 + 清髒資料），不做顯示層 hack：

- **A**（補 spec 008 漏網）：`addWatch` 實際套用 `ensureTradableSymbol` 存在性驗證，杜絕 `0073` / `9999` 之類幽靈代號被加入關注清單（與 `triggerAnalysis` / `triggerResearch` 一致）。
- **B**（真·吃碼數 bug）：worker 聊天問答的 `extractSymbol` 從 `/\b(\d{4})\b/` 放寬為 `/\b(\d{4,6})\b/`，否則白話問「00735 可以買嗎」抓不到代號（5/6 碼被吃掉）。
- **C**（資料清理）：刪除既有殘留的幽靈關注列 `0073`（修正前被截斷產生，程式已修但舊資料仍在）。

## 背景

> 參考知識：[`docs/specs/doing/20260607-008-etf-support-completion.spec.md`](./20260607-008-etf-support-completion.spec.md)、[`docs/specs/doing/20260607-007-frontend-symbol-truncation.spec.md`](./20260607-007-frontend-symbol-truncation.spec.md)

使用者回報：關注清單顯示 `0073`（無中文名、無行情、無評分），實為 `00735 國泰臺韓科技` 被砍成 4 碼。追查現況：

1. **新增路徑已修好**：前端 `parseSymbol`（[`console/page.tsx:65`](../../../admin/src/app/(dashboard)/stock-bot/console/page.tsx#L65)）、`submitRaw`（[`console/StockCombobox.tsx:52`](../../../admin/src/app/(dashboard)/stock-bot/console/StockCombobox.tsx#L52)）、後端 `SYMBOL_RE`（[`stock-service.ts:42`](../../../admin/src/lib/stock-service.ts#L42)）皆已是 `/^\d{4,6}/`。每日分析派發（`scheduler.ts` / `screen.ts`）直接讀 watchlist 代號、無 4 碼過濾。→ **現在加入 `00735` 會正確存檔並取得行情/評分。**
2. **畫面上的 `0073` 是舊資料**：spec 007 修前端前就被截斷存入 DB，程式修好後這筆髒資料仍殘留。
3. **spec 008 的 A 變更從未真正落地**：spec 008 已標 ✅，其「實際變更」聲稱 `addWatch` 改用 `ensureTradableSymbol`，但目前 [`stock-service.ts:317`](../../../admin/src/lib/stock-service.ts#L317) 仍是舊的純格式檢查 `isValidSymbol`（訊息還停在「需 4 位數」）。推測 merge/revert 時遺失。→ 幽靈代號（格式合法但不存在）仍可從非下拉路徑被加入。
4. **唯一仍會「吃碼數」的程式**：worker 聊天 `extractSymbol`（[`qa.ts:18`](../../../worker/src/jobs/qa.ts#L18)）的 `/\b(\d{4})\b/`，對 5/6 碼代號連 4 碼都抓不到（`\b` 邊界使 `00735` 完全無匹配）。

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema 變更（僅一次性 DML 清理一筆資料，非 migration） |
| `common` | ❌ | 沿用既有型別，不新增（既有 4–6 碼正則已散落但語意一致，集中化列為後續可選，不在本次範圍） |
| `admin` | ✅ | A：`addWatch` 改用 `ensureTradableSymbol` 守衛 |
| `worker` | ✅ | B：`extractSymbol` 正則放寬 4–6 碼 |

## 建議開發順序

1. `admin` — A：`stock-service.ts` 的 `addWatch`
2. `worker` — B：`qa.ts` 的 `extractSymbol`
3. 一次性 — C：刪除 `watchlist` 表的 `0073` 幽靈列

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-service.ts` | 修改 | `addWatch`：移除只做格式檢查的 `isValidSymbol` 區塊（含過時訊息「需 4 位數」），改為入列前 `const guard = await ensureTradableSymbol(sym); if (guard) { return guard; }`（沿用 `triggerAnalysis` / `triggerResearch` 既有 pattern） |

### worker

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/jobs/qa.ts` | 修改 | `extractSymbol`：`/\b(\d{4})\b/` → `/\b(\d{4,6})\b/`；註解「4 位數」→「4–6 位數」 |

### 一次性資料清理（非檔案）

- 對 DB 執行：`DELETE FROM watchlist WHERE symbol = '0073';`（表名 `watchlist`、欄位 `symbol`，見 `prisma/schema.prisma` 第 131–146 行）。
- 執行方式：`"DELETE FROM watchlist WHERE symbol = '0073';" | npx prisma db execute --stdin --schema prisma/schema.prisma`（讀 `.env` 的 `DATABASE_URL`）。
- `0073` 非台股實際上市代號（4 碼 ETF 僅 `0050`/`0051`/`0056` 等少數），刪除安全。

---

## 邏輯變更點

### A — `admin/src/lib/stock-service.ts`（`addWatch`）

- 保留空字串檢查（`請提供股票代號`）。
- 將下列整段：
  ```ts
  if (!isValidSymbol(sym)) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '股票代號格式錯誤（需 4 位數）',
      ApiErrorCode.STOCK.SYMBOL_INVALID,
    );
  }
  ```
  替換為：
  ```ts
  const guard = await ensureTradableSymbol(sym);
  if (guard) {
    return guard;
  }
  ```
- `ensureTradableSymbol` 內已含格式檢查（`/^\d{4,6}$/`）→ 本地 `StockInfo` 命中放行 → 否則 FinMind 權威查（存在則 upsert 快取放行、查無回 `NOT_FOUND`「查無此代號 …」、網路/API 失敗降級放行）。
- 型別：`ensureTradableSymbol` 回 `ApiResult<never> | null`，於回傳 `ApiResult<WatchlistDto>` 的函式中 `return guard` 合法（`never` ⊆ `WatchlistDto`），與 `triggerAnalysis` 同寫法。

### B — `worker/src/jobs/qa.ts`（`extractSymbol`）

- `const m = text.match(/\b(\d{4})\b/);` → `const m = text.match(/\b(\d{4,6})\b/);`
- 函式 JSDoc「抓第一個 4 位數台股代號」→「抓第一個 4–6 位數台股代號（含 ETF）」。

### 刻意不改（回應「不要少碼數」的疑慮）

- `worker/src/data/market.ts:164`（漲跌家數 breadth）、`worker/src/data/twse.ts:49`（飆股雷達 top-gainers）的 `/^\d{4}$/` **維持不動**。理由（同 spec 008 §3）：這兩處是對 TWSE `STOCK_DAY_ALL`（含全部證券）做「市場宇宙過濾」，**不是對某個代號截斷**；放寬會把 6 碼權證灌進來、扭曲市場廣度與飆股榜。它們不影響任何 watchlist 代號取得資料。

## API 合約（若有 API 異動）

| 端點 | 方法 | 請求格式變更 | 回應格式變更 |
| --- | --- | --- | --- |
| 加入關注（`/api/v1/stock/watchlist`） | POST | 無 | 代號不存在時改回 `NOT_FOUND`（404）+「查無此代號 …」（原為純格式錯誤訊息「需 4 位數」或誤建幽靈列） |

## 回滾計劃

1. 還原 `addWatch` 的 `isValidSymbol` 格式檢查區塊、移除 `ensureTradableSymbol` 呼叫。
2. 還原 `qa.ts` 的 `extractSymbol` 正則為 `/\b(\d{4})\b/`。
3. 資料刪除無法回滾，但 `0073` 為幽靈代號、刪除即正確狀態，無回滾需求。

## 預期測試結果

- [x] `npm run type:check`（admin）通過、無錯誤
- [x] `npm run type:check`（worker）通過、無錯誤
- [x] 一次性 DML 執行成功：`DELETE FROM watchlist WHERE symbol = '0073'`
- [ ]（使用者於執行中 app 驗證）關注清單不再出現 `0073`
- [ ]（使用者驗證）下拉選 `00735 國泰臺韓科技` 加入 → 正常入列、可「分析」取得行情/評分
- [ ]（使用者驗證）輸入不存在代號（如 `9999`）加入 → 回「查無此代號 9999…」，不建立關注列
- [ ]（使用者驗證）聊天問「00735 可以買嗎」→ 能正確解析代號

## 風險評估

- A 多一次 FinMind 查詢：低頻使用者主動操作，本地命中不打網路、失敗降級放行，風險低（同 023/008 論證）。
- B 為放寬（只多放行、不多擋），對既有 4 碼行為不變。
- C 為一次性 DML，僅刪一筆已確認幽靈列，影響面極小。

---

## 實際變更

- `admin/src/lib/stock-service.ts` — `addWatch`：移除純格式檢查 `isValidSymbol` 區塊（含「需 4 位數」訊息），改為 `const guard = await ensureTradableSymbol(sym); if (guard) return guard;`（重新落地 spec 008 A）。
- `worker/src/jobs/qa.ts` — `extractSymbol`：`/\b(\d{4})\b/` → `/\b(\d{4,6})\b/`，JSDoc 同步更新為「4–6 位數（含 ETF）」。
- 一次性 DML：`DELETE FROM watchlist WHERE symbol = '0073'`（透過 `prisma db execute --stdin`）。

<!-- PostToolUse Hook 自動追加 Edit/Write 的檔案路徑 -->

## Bug Log

### Bug #1: spec 008「addWatch 加 ensureTradableSymbol」聲稱完成但程式未落地

| 分類 | 內容 |
| --- | --- |
| **[Bug]** | spec 008 標 ✅ 且「實際變更」聲稱 `addWatch` 已改用 `ensureTradableSymbol`，但目前程式仍是純格式檢查 `isValidSymbol`（訊息「需 4 位數」），幽靈代號仍可入列。 |
| **[Root Cause]** | 推測 merge/revert 時該變更遺失；spec 文件未與程式同步驗證。 |
| **[Solution]** | 本 Spec A 重新落地 `ensureTradableSymbol` 守衛。 |
| **[Prevention]** | 完成後以 `type:check` + 實機驗證雙重確認；spec「實際變更」需對照程式碼。 |

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

使用者連續指示：「為什麼代號少一碼」→「幫我修正這些問題」→「不要少碼數」→「修正走正規做法」。確認目標＝徹底修台股代號少碼（修根因 + 清髒資料），不做顯示 hack。

### 關鍵問答

#### 為什麼畫面還是 `0073`？前端不是修過了嗎？

**AI 回應摘要**: 前端/後端新增路徑（parseSymbol/submitRaw/SYMBOL_RE）確已是 4–6 碼，每日派發也無 4 碼過濾，故新加入 `00735` 會正確。畫面的 `0073` 是 spec 007 修前就存入的舊資料；且 spec 008「addWatch 存在性驗證」其實沒落地。真正仍吃碼數的只剩聊天 `extractSymbol`。

#### worker 的 `/^\d{4}$/` 要不要一起放寬？

**AI 回應摘要**: 不要。market.ts/twse.ts 是 breadth/top-gainers 的市場宇宙過濾，非代號截斷；放寬會灌入 6 碼權證扭曲統計。它們不影響 watchlist 代號取得資料（spec 008 §3 已論證）。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| `addWatch` 加 `ensureTradableSymbol`（重新落地 spec 008 A） | ✅ 採納 | 杜絕幽靈代號入列，與分析/研究一致 |
| `qa.ts` `extractSymbol` 放寬 4–6 碼 | ✅ 採納 | 唯一仍吃碼數的程式，影響聊天 5/6 碼 ETF |
| 一次性刪除 `0073` 幽靈列 | ✅ 採納 | 程式已修但舊髒資料殘留，需清理 |
| 放寬 market.ts/twse.ts `/^\d{4}$/` | ❌ 棄用 | breadth/top-gainers 宇宙過濾，放寬灌入權證、非代號截斷 |
| 把 4–6 碼正則集中到 `common` | ⏸ 延後 | 現有散落正則語意一致且已正確；跨 workspace 集中化 payoff 低、徒增 rebuild 風險，列為後續可選 |

### 產出摘要

- **A**（`addWatch`）：以 `ensureTradableSymbol(sym)` 守衛取代純格式檢查；不存在代號回 `NOT_FOUND`「查無此代號 …」，不再建立幽靈關注列。重新落地 spec 008 聲稱但未落地的變更。
- **B**（`extractSymbol`）：正則放寬 4–6 碼，聊天問「00735 可以買嗎」可正確解析代號（原 `\b(\d{4})\b` 對 5/6 碼完全無匹配）。
- **C**（資料清理）：刪除殘留幽靈列 `0073`。
- **刻意未改**：`market.ts` / `twse.ts` 的 `/^\d{4}$/`（breadth / top-gainers 市場宇宙過濾，非代號截斷；放寬會灌入 6 碼權證）。
- **後續可選**：把散落的 4–6 碼正則集中到 `common`（現皆語意一致且正確，非必要）。
- **驗證**：`npm run type:check`（admin、worker）皆通過；DML 執行成功。待使用者於執行中 app 確認 `0073` 消失、`00735` 可正常加入/分析。
