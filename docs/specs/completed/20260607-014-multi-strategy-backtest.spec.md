# 多策略回測 + 策略比較頁（可插拔註冊表）

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: `C:/Users/a4756/.claude/plans/kd-abstract-castle.md`（已核准）
>
> 完成摘要：common 80 組測試全綠（含原 KD 9 組逐位元不變）+ worker oracle 對拍；admin tsc + 新檔 lint 0 error；
> migration `20260607081919_add_backtest_batch` 純加法已套用；已 `docker compose up -d --build admin worker` 重建上線
> （kanban-admin:3020 + kanban-stock-worker，worker queues 含 backtest-batch、admin Next.js Ready）。
> 取捨：`backtest-verdict.ts` 既存（KD builder）改複用 `buildBacktestVerdict`；glossary 完整性由 `Record<GlossaryKey,_>` 型別保證，未另寫 runtime 測試。

---

## 目標

把現行單一 KD 策略回測重構為**可插拔策略註冊表**（通用引擎 + 每策略一個訊號產生純函式），
新增 4 種策略（均線交叉 MA / MACD 金叉死叉 / RSI 超賣超買 / 布林通道 Bollinger），
並新增**策略比較頁**（同一檔股票一次跑多策略、並排比績效 + 疊圖 + 冠軍），同時更新側欄菜單（分組子選單）。

## 背景

KD 回測引擎（`common/src/backtest/kd-strategy.ts`）的交易迴圈與策略無關，只有交叉判斷是策略專屬。
抽出通用引擎後，加策略只需新增一個 `StrategyDef`。比較頁需新增 DB 父表分組多筆子回測。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ✅ | 新增 `BacktestBatch` 表 + `BacktestRun.batchId` 外鍵/索引（純加法 migration） |
| `common` | ✅ | 拆出通用引擎 + 指標 + 策略註冊表 + 5 策略定義 + 共用型別 |
| `worker` | ✅ | 單筆 registry 化 + 新增 batch job + stale-reaper + oracle 測試 |
| `admin` | ✅ | 動態表單 + 比較頁 + service/API + 名詞字典 + 菜單分組 + 跨功能入口 |

## 建議開發順序

1. `prisma` — schema + migration
2. `common` — 引擎/指標/註冊表/策略/型別
3. `worker` — 單筆改寫 + batch job
4. `admin` — service/API/UI/菜單

---

## 受影響檔案

### prisma

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `prisma/schema.prisma` | 修改 | 新增 `BacktestBatch` model + `BacktestRun` 加 batchId/engineVersion/索引 |

### common

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `common/src/backtest/indicators.ts` | 新增 | smaSeries/emaSeries/rsiSeries/macdSeries/bollingerSeries + stochasticSeries |
| `common/src/backtest/engine.ts` | 新增 | CommonBacktestParams + runBacktest + computeStats + buildBuyHold |
| `common/src/backtest/registry.ts` | 新增 | StrategyDef + STRATEGY_REGISTRY + getStrategy + runStrategyBacktest |
| `common/src/backtest/strategy-meta.ts` | 新增 | listStrategyMeta() 純資料（client 安全） |
| `common/src/backtest/params.ts` | 新增 | normalizeStoredParams（相容舊扁平 KD 列） |
| `common/src/backtest/strategies/kd.ts` | 新增 | KD StrategyDef |
| `common/src/backtest/strategies/ma-cross.ts` | 新增 | 均線交叉 StrategyDef |
| `common/src/backtest/strategies/macd.ts` | 新增 | MACD StrategyDef |
| `common/src/backtest/strategies/rsi.ts` | 新增 | RSI StrategyDef |
| `common/src/backtest/strategies/bollinger.ts` | 新增 | 布林通道 StrategyDef |
| `common/src/backtest/kd-strategy.ts` | 修改 | runKdBacktest 改薄包裝 + re-export |
| `common/src/backtest/types.ts` | 修改 | 保留相容包裝型別 |
| `common/src/stock-types.ts` | 修改 | StockJobType.BACKTEST_BATCH + Comparison 型別 |
| `common/src/index.ts` | 修改 | re-export 新 API/型別 |
| `common/src/backtest/indicators.test.ts` | 新增 | 指標單元測試（common 內部一致性） |
| `common/src/backtest/engine.test.ts` | 新增 | 引擎公平性測試 |
| `common/src/backtest/strategies/kd.test.ts` | 新增 | KD 策略訊號測試 |
| `common/src/backtest/strategies/ma-cross.test.ts` | 新增 | MA 策略訊號測試 |
| `common/src/backtest/strategies/macd.test.ts` | 新增 | MACD 策略訊號測試 |
| `common/src/backtest/strategies/rsi.test.ts` | 新增 | RSI 策略訊號測試 |
| `common/src/backtest/strategies/bollinger.test.ts` | 新增 | 布林策略訊號測試 |

### worker

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/queue/queues.ts` | 修改 | 擴充 BacktestJobData + BacktestBatchJobData + enqueueComparison + MONITORED_QUEUES |
| `worker/src/jobs/backtest.ts` | 修改 | 單筆 registry 化 + 相容舊資料 |
| `worker/src/jobs/backtest-batch.ts` | 新增 | processBatch（載 K 線一次、對齊、寫子列 + 父終態） |
| `worker/src/jobs/workers.ts` | 修改 | 註冊 backtestBatchWorker + reaper 啟動 |
| `worker/src/jobs/stale-batch-reaper.ts` | 新增 | 逾時 running batch → failed |
| `worker/src/ta/backtest-indicators.test.ts` | 新增 | oracle 對拍（vs technicalindicators） |

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-queue.ts` | 修改 | enqueueBacktest 帶新欄位 + enqueueComparison |
| `admin/src/lib/stock-service.ts` | 修改 | normalize* + runBacktest/runComparison/getComparison/listBacktestBatches/deleteComparison + jobSummary |
| `admin/src/lib/backtest-verdict.ts` | 新增 | 績效白話結論 |
| `admin/src/app/api/v1/stock/backtest/route.ts` | 修改 | POST 接受 strategy |
| `admin/src/app/api/v1/stock/backtest/compare/route.ts` | 新增 | 比較 POST/GET/DELETE |
| `admin/src/config/financial-glossary.ts` | 修改 | 新增策略/參數名詞 + 分組 |
| `admin/src/config/routes.ts` | 修改 | backtestCompare 路由 |
| `admin/src/layouts/hydrogen/menu-items.tsx` | 修改 | stockBacktest 改分組子選單 |
| `admin/src/locales/zh-TW.json` | 修改 | 菜單 i18n（中） |
| `admin/src/locales/en.json` | 修改 | 菜單 i18n（英） |
| `admin/src/app/(dashboard)/stock-bot/backtest/_lib/api.ts` | 新增 | 共用 apiGet/apiPost/sleep |
| `admin/src/app/(dashboard)/stock-bot/backtest/BacktestForm.tsx` | 修改 | 策略下拉 + 動態參數 + initialSymbol |
| `admin/src/app/(dashboard)/stock-bot/backtest/BacktestResultView.tsx` | 修改 | 策略感知 + export 共用 helper |
| `admin/src/app/(dashboard)/stock-bot/backtest/page.tsx` | 修改 | ?symbol prefill + 歷史策略欄/篩選 |
| `admin/src/app/(dashboard)/stock-bot/backtest/compare/page.tsx` | 新增 | 比較頁主體 + 輪詢 |
| `admin/src/app/(dashboard)/stock-bot/backtest/compare/CompareForm.tsx` | 新增 | 策略多選 + 每 entry 參數 |
| `admin/src/app/(dashboard)/stock-bot/backtest/compare/CompareResultView.tsx` | 新增 | 冠軍卡 + 狀態 + 組合 |
| `admin/src/app/(dashboard)/stock-bot/backtest/compare/ComparisonTable.tsx` | 新增 | 可排序並排表 + best/worst |
| `admin/src/app/(dashboard)/stock-bot/backtest/compare/ComparisonChart.tsx` | 新增 | 多線疊圖 + tooltip + 圖例 |
| `admin/src/app/(dashboard)/stock-bot/backtest/compare/StatusChip.tsx` | 新增 | 子狀態晶片 |
| `admin/src/app/(dashboard)/stock-bot/backtest/compare/comparison-helpers.ts` | 新增 | 格式化 + bestWorst + resolveLabels |
| `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` | 修改 | 加「回測這檔/比較策略」入口 |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 修改 | 加「用 K 線回測」入口 |
| `admin/__tests__/glossary-completeness.test.ts` | 新增 | GlossaryKey 完整性 |

---

## 邏輯變更點

- **common**：交易迴圈抽至 `engine.ts:runBacktest(klines, signals, warmup, common, startIndex?)`；
  策略只實作 `generateSignals`；`runKdBacktest` 變薄包裝。指標序列與 klines 等長、warmup 為 null。
- **比較公平性**：在 service/worker 端把所有 entry + 單一 buy-hold 對齊到 `globalStart = max(warmup)`。
- **worker batch**：單一 job 載 K 線一次、跑完所有 entry、一交易寫子列 + 父終態（done/partial/failed）。
- **admin**：表單依 `listStrategyMeta()` 動態渲染；比較頁輪詢 `getComparison(batchId)` 增量渲染。

## 資料表異動

| 資料表 | 欄位 | 異動類型 | 詳細說明 |
| --- | --- | --- | --- |
| `backtest_batch` | （整表） | 新增表 | id/symbol/start_date/end_date(@db.Date)/common/entries/status/global_start_date/buy_hold_pct/buy_hold_curve/champion_run_id/params_hash/engine_version/created_by_id/error/job_id/created_at/updated_at；index([symbol, created_at]) |
| `backtest_run` | `batch_id` | 新增欄位 | String? 外鍵 → backtest_batch(onDelete: Cascade) |
| `backtest_run` | `engine_version` | 新增欄位 | Int? |
| `backtest_run` | （索引） | 新增 index | `@@index([batch_id])`、`@@index([strategy, created_at])` |

Migration 注意事項：
- [ ] 需要 down migration（回滾腳本）— Prisma 自動產生
- [x] 純加法、不影響現有資料（既有列 batch_id=NULL）
- [x] 新增 index
- [x] 新增外鍵約束（onDelete: Cascade）

## API 合約

| 端點 | 方法 | 請求格式變更 | 回應格式變更 |
| --- | --- | --- | --- |
| `/api/v1/stock/backtest` | POST | body 加 `strategy` + 策略專屬 `params` | 不變（{ runId }） |
| `/api/v1/stock/backtest/compare` | POST | `{ symbol, startDate?, endDate?, common, entries: {strategyId,params,label}[] }` | `{ batchId }` |
| `/api/v1/stock/backtest/compare` | GET | `?batchId=` 單筆 / 無參列表 | `ComparisonResult` / batch 列表 |
| `/api/v1/stock/backtest/compare` | DELETE | `?batchId=` | 成功旗標（級聯刪子列） |

## 回滾計劃

1. 執行 down migration（移除 backtest_batch + backtest_run 新欄位/索引）。
2. 回退 common/worker/admin 程式碼至上一版本（runKdBacktest 原實作仍可用）。

## 預期測試結果

- [ ] common：kd-strategy.test.ts 不動全綠；各 strategies/*.test.ts、engine.test.ts、indicators.test.ts 通過
- [ ] worker：backtest-indicators.test.ts oracle 對拍通過
- [ ] admin：glossary 完整性測試通過；type:check / build 通過
- [ ] E2E：單筆 5 策略、比較頁、部分失敗、菜單分組、跨功能入口、migration 相容

## 風險評估

- common 為零依賴，指標需手刻 → 以 worker oracle 測試對拍 technicalindicators 把關正確性。
- KD 行為須與重構前逐位元一致（回歸閘）。
- Next 16 `useSearchParams` 需 Suspense boundary，否則 build 失敗。
- migration 須純加法，既有 backtest_run 列相容。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

{開發過程中遇到的 Bug}

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

把單一 KD 回測重構為可插拔多策略 + 比較頁，長期可擴充、注重細節、更新菜單。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 可插拔策略註冊表（vs if-else） | ✅ 採納 | 未來加策略只動 strategies/* + 註冊一行 |
| 比較用 BacktestBatch 父表（vs 僅 batchId） | ✅ 採納 | 單一可輪詢父節點 + 共用 buy-hold + 級聯刪除 |
| 單一 batch job（vs N 獨立 job） | ✅ 採納 | 消除 done-race / 5× 逾時 / 5× K 線載入 |
| LINE /backtest 指令 | ❌ 棄用（延後） | webhook 同步單次回覆、比較頁富表格網頁最適 |

### 產出摘要

<!-- 完成後更新 -->
- `prisma/schema.prisma` — Edit @ 2026-06-07 08:15
- `common/src/backtest/indicators.ts` — Write @ 2026-06-07 08:19
- `common/src/backtest/types.ts` — Edit @ 2026-06-07 08:19
- `common/src/backtest/engine.ts` — Write @ 2026-06-07 08:20
- `common/src/backtest/strategy-meta.ts` — Write @ 2026-06-07 08:21
- `common/src/backtest/params.ts` — Write @ 2026-06-07 08:23
- `common/src/backtest/registry.ts` — Write @ 2026-06-07 08:23
- `common/src/backtest/strategies/kd.ts` — Write @ 2026-06-07 08:23
- `common/src/backtest/strategies/ma-cross.ts` — Write @ 2026-06-07 08:23
- `common/src/backtest/strategies/macd.ts` — Write @ 2026-06-07 08:24
- `common/src/backtest/strategies/rsi.ts` — Write @ 2026-06-07 08:24
- `common/src/backtest/strategies/bollinger.ts` — Write @ 2026-06-07 08:24
- `common/src/backtest/kd-strategy.ts` — Write @ 2026-06-07 08:25
- `common/src/stock-types.ts` — Edit @ 2026-06-07 08:25
- `common/src/index.ts` — Edit @ 2026-06-07 08:26
- `common/src/backtest/indicators.test.ts` — Write @ 2026-06-07 08:27
- `common/src/backtest/engine.test.ts` — Write @ 2026-06-07 08:28
- `common/src/backtest/strategies/ma-cross.test.ts` — Write @ 2026-06-07 08:28
- `common/src/backtest/strategies/macd.test.ts` — Write @ 2026-06-07 08:28
- `common/src/backtest/strategies/rsi.test.ts` — Write @ 2026-06-07 08:28
- `common/src/backtest/strategies/bollinger.test.ts` — Write @ 2026-06-07 08:28
- `common/src/backtest/strategies/kd.test.ts` — Write @ 2026-06-07 08:29
- `worker/src/queue/queues.ts` — Edit @ 2026-06-07 08:33
- `worker/src/jobs/backtest.ts` — Write @ 2026-06-07 08:35
- `worker/src/jobs/backtest-batch.ts` — Write @ 2026-06-07 08:36
- `worker/src/jobs/stale-batch-reaper.ts` — Write @ 2026-06-07 08:36
- `worker/src/jobs/workers.ts` — Edit @ 2026-06-07 08:36
- `worker/src/ta/backtest-indicators.test.ts` — Write @ 2026-06-07 08:38
- `worker/src/ta/backtest-indicators.test.ts` — Edit @ 2026-06-07 08:38
- `admin/src/lib/stock-queue.ts` — Edit @ 2026-06-07 08:39
- `admin/src/app/api/v1/stock/backtest/compare/route.ts` — Write @ 2026-06-07 08:44
- `admin/src/app/api/v1/stock/backtest/route.ts` — Edit @ 2026-06-07 08:44
- `admin/src/config/routes.ts` — Edit @ 2026-06-07 08:44
- `admin/src/layouts/hydrogen/menu-items.tsx` — Edit @ 2026-06-07 08:44
- `common/src/backtest/strategy-meta.ts` — Edit @ 2026-06-07 08:45
- `admin/src/app/(dashboard)/stock-bot/backtest/BacktestForm.tsx` — Write @ 2026-06-07 08:50
- `admin/src/app/(dashboard)/stock-bot/backtest/_lib/api.ts` — Write @ 2026-06-07 08:51
- `admin/src/app/(dashboard)/stock-bot/backtest/compare/comparison-helpers.ts` — Write @ 2026-06-07 08:53
- `admin/src/app/(dashboard)/stock-bot/backtest/compare/StatusChip.tsx` — Write @ 2026-06-07 08:54
- `admin/src/app/(dashboard)/stock-bot/backtest/compare/ComparisonChart.tsx` — Write @ 2026-06-07 08:54
- `admin/src/app/(dashboard)/stock-bot/backtest/compare/ComparisonTable.tsx` — Write @ 2026-06-07 08:55
- `admin/src/app/(dashboard)/stock-bot/backtest/compare/CompareForm.tsx` — Write @ 2026-06-07 08:56
- `admin/src/app/(dashboard)/stock-bot/backtest/compare/CompareResultView.tsx` — Write @ 2026-06-07 08:56
- `admin/src/app/(dashboard)/stock-bot/backtest/compare/page.tsx` — Write @ 2026-06-07 08:57
- `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` — Edit @ 2026-06-07 08:58
- `admin/src/app/(dashboard)/stock-bot/console/page.tsx` — Edit @ 2026-06-07 08:58
