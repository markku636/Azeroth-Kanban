# 股票 AI 機器人 — 地基與 worker 核心(資料層 / TA / 佇列)

> 建立日期: 2026-06-05
> 狀態: ✅ 已完成
> 關聯計劃書: C:\Users\a4756\.claude\plans\ai-frolicking-fairy.md(SA/SD + 技術架構 + 實作計劃)

---

## 目標

建立股票 AI 機器人的**地基與 worker 核心**(實作計劃 Phase 2~4 的非 LLM 部分),讓後續 Deep Agent / admin / LINE 可以接上:

1. 新增 `worker/` workspace(常駐 Node 進程)骨架。
2. `docker-compose.yml` 新增 Redis 服務。
3. Prisma 擴充股票相關 model + seed 權限碼。
4. `common` 擴充 Stock 共用型別 + `STOCK` 錯誤碼。
5. **資料層**:FinMind / TWSE 抓取 + 快取(`worker/src/data`)。
6. **技術分析**:`technicalindicators` 指標 + 訊號規則 + echarts 出 K 線 PNG(`worker/src/ta`)。
7. **佇列**:BullMQ 佇列定義 + Redis 連線(`worker/src/queue`)。

> 本 Spec 僅涵蓋核心資料/運算/佇列層;Deep Agent、admin API/console、LINE 另立 Spec。

## 背景

既有 repo 為 Next.js + Prisma monorepo,無佇列/LLM/外部整合。股票機器人需新增常駐背景進程承載排程與分析。沿用既有 `ApiResult` 回傳格式、Prisma snake_case 慣例、npm workspaces 結構。

> 參考知識:docs/knowledge/architecture/20260425-001-monorepo-workspace-layout.md
> 參考知識:docs/knowledge/architecture/20260425-002-api-three-layer-and-apiresult.md

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ✅ | 新增 Watchlist / StockDailyPrice / AnalysisSignal / ResearchReport / AnalysisRun / LineSubscriber model;seed 新增 STOCK 權限 |
| `common` | ✅ | 新增 Stock 共用型別;api-error-code 新增 STOCK 區段 |
| `admin` | ❌ | 本 Spec 不動 admin(另立 Spec) |
| `worker` | ✅(新) | 全新 workspace:data / ta / queue 核心 |

## 建議開發順序

1. `prisma` — schema 擴充 + seed 權限
2. `common` — 型別 + 錯誤碼
3. `worker` — workspace 骨架 → data → ta → queue
4. 根 `package.json` / `docker-compose.yml` — 納入 worker + redis

---

## 受影響檔案

### prisma

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `prisma/schema.prisma` | 修改 | 新增股票相關 model |
| `prisma/seed.ts` | 修改 | 新增 STOCK_* 權限與角色對應 |
| `prisma/migrations/20260605120000_add_stock_bot/migration.sql` | 新增 | 股票相關資料表 migration |

### common

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `common/src/stock-types.ts` | 新增 | OHLCV / Signal / Report / Indicators 共用型別 |
| `common/src/api-error-code.ts` | 修改 | 新增 `STOCK` 錯誤碼區段 |
| `common/src/index.ts` | 修改 | re-export stock-types |

### worker(新 workspace)

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/package.json` | 新增 | workspace 設定與相依 |
| `worker/tsconfig.json` | 新增 | TS 設定 |
| `worker/src/config.ts` | 新增 | 環境變數讀取與驗證 |
| `worker/src/index.ts` | 新增 | 進程入口(暫掛載 worker 啟動) |
| `worker/src/db.ts` | 新增 | Prisma client 單例 |
| `worker/src/logger.ts` | 新增 | 結構化 log 小工具 |
| `worker/src/data/types.ts` | 新增 | 資料層內部型別 |
| `worker/src/data/finmind.ts` | 新增 | FinMind REST 抓取(日K/新聞/法人) |
| `worker/src/data/twse.ts` | 新增 | TWSE OpenAPI 抓取(漲幅排行/日成交) |
| `worker/src/data/cache.ts` | 新增 | 日K 寫入/讀取 StockDailyPrice 快取 |
| `worker/src/ta/indicators.ts` | 新增 | MA/EMA/MACD/RSI/KD/布林/量能 計算 |
| `worker/src/ta/signals.ts` | 新增 | 買賣訊號規則 |
| `worker/src/ta/chart.ts` | 新增 | echarts + canvas 出 K 線 PNG |
| `worker/src/ta/ta.test.ts` | 新增 | 指標/訊號/出圖單元測試 |
| `worker/src/queue/connection.ts` | 新增 | ioredis 連線工廠 |
| `worker/src/queue/queues.ts` | 新增 | BullMQ 佇列定義(analysis/research/digest/line-push) |

### 根層級(非程式碼,不受 hook 限制)

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `package.json` | 修改 | workspaces 加入 `worker` |
| `docker-compose.yml` | 修改 | 新增 `redis` 服務 |
| `.env.example` | 修改 | 新增股票/LLM/LINE 環境變數 |

---

## 邏輯變更點

- **prisma**:新增 6 個 model,皆 snake_case `@map`,沿用 cuid id 與 created/updated 慣例;`StockDailyPrice` 唯一鍵 (symbol, trade_date);`AnalysisSignal`/`ResearchReport` 唯一鍵含日期。
- **common**:`StockOhlcv`、`StockIndicators`、`TradeSignal`、`SignalAction` enum、`ResearchReportDto`;`ApiErrorCode.STOCK.*`。
- **worker/data**:`fetchDailyKline(symbol, start, end)`(FinMind,失敗 fallback TWSE)、`fetchStockNews`、`fetchInstitutionalTrades`、`fetchTopGainers`(TWSE);`upsertDailyPrices` / `getCachedKline`。
- **worker/ta**:`computeIndicators(ohlcv[])`、`generateSignal(ohlcv[], indicators)`(黃金交叉/MACD/RSI/KD/量能規則 → action+進出場+信心)、`renderKlineChart(ohlcv[], indicators)→ PNG Buffer`。
- **worker/queue**:`getRedis()`、四個 `Queue` 實例與名稱常數。

## 資料表異動

| 資料表 | 異動類型 | 詳細說明 |
| --- | --- | --- |
| `watchlist` | 新增 | member_id, symbol, name, tags(String[]), is_active |
| `stock_daily_price` | 新增 | symbol, trade_date, open/high/low/close/volume, source;@@unique([symbol, trade_date]) |
| `analysis_signal` | 新增 | symbol, trade_date, action, entry/stop/target, confidence, rationale/patterns/indicators(Json) |
| `research_report` | 新增 | symbol, report_date, title, summary, body(Text), sources(Json), sentiment;@@unique([symbol, report_date]) |
| `analysis_run` | 新增 | type, status, input/output(Json), error |
| `line_subscriber` | 新增 | line_user_id(unique), member_id?, is_active |

Migration 注意事項:
- [x] 純新增資料表,不影響現有資料
- [ ] 無 down migration 需求(新表)

## 回滾計劃

1. `prisma migrate reset` 或刪除本次 migration 後重跑。
2. 移除 `worker/` 與 docker-compose `redis` 服務。

## 預期測試結果

- [ ] `npm install` 成功解析 worker 相依
- [ ] `prisma generate` + `migrate` 成功建表
- [ ] `computeIndicators` / `generateSignal` 單元測試數值正確
- [ ] `renderKlineChart` 產出非空 PNG Buffer
- [ ] FinMind/TWSE 抓取(mock)回傳正規化 OHLCV

## 風險評估

- `technicalindicators` v3 移除 K 線型態 → 鎖 v2 或型態交給 vision。
- `@napi-rs/canvas` 出圖原生相依;Alpine 需確認可裝。
- Node 版本:LINE v11 需 Node 22(本 Spec 未含 LINE,先不強制升版)。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

(開發中記錄)
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/config.ts` — Edit @ 2026-06-05 14:45
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/data/finmind.ts` — Edit @ 2026-06-05 14:49
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/ta/signals.ts` — Edit @ 2026-06-05 16:41
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/ta/ta.test.ts` — Edit @ 2026-06-05 16:42
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/common/src/stock-types.ts` — Edit @ 2026-06-05 16:43
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/queue/queues.ts` — Edit @ 2026-06-05 16:43
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/prisma/schema.prisma` — Edit @ 2026-06-05 16:47
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/index.ts` — Edit @ 2026-06-06 00:21
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/common/src/index.ts` — Edit @ 2026-06-06 00:31
- `prisma/schema.prisma` — Edit @ 2026-06-06 03:21
- `prisma/seed.ts` — Edit @ 2026-06-06 03:21
- `common/src/api-error-code.ts` — Edit @ 2026-06-06 03:21
- `common/src/stock-types.ts` — Edit @ 2026-06-06 08:40
- `common/src/index.ts` — Edit @ 2026-06-06 08:40
- `worker/src/queue/queues.ts` — Edit @ 2026-06-06 10:53
- `worker/src/ta/signals.ts` — Edit @ 2026-06-06 12:53
- `worker/src/ta/ta.test.ts` — Edit @ 2026-06-06 16:05
- `worker/src/ta/indicators.ts` — Write @ 2026-06-06 16:15
