# 股票 AI 機器人 — admin API + 三層 service + 後台 console

> 建立日期: 2026-06-05
> 狀態: ✅ 已完成
> 關聯計劃書: C:\Users\a4756\.claude\plans\ai-frolicking-fairy.md
> 前置 Spec: 20260605-001（地基）、20260605-002（Deep Agent + jobs）

---

## 目標

在 admin（Next.js）提供股票機器人的 API 與後台介面（計劃 Phase 7 前半）：

1. STOCK 權限碼納入 `PERMISSIONS` 常數。
2. BullMQ producer（admin 端入列 job 到 worker）。
3. 三層 service：watchlist CRUD、查訊號/報告（回 ApiResult，不 throw）。
4. API routes：watchlist、signals、reports、analyze（入列）、reports/generate（入列）、simulate（指令路由）。
5. 後台 console 頁面：模擬指令對話 + watchlist 管理 + 訊號/報告檢視 + 手動觸發。

## 背景

沿用既有三層架構（route → service(回 ApiResult) → prisma）、`withPermission` 裝飾器、`ApiResponse`、`@/lib/prisma`。worker 已提供佇列名稱（`@azeroth/common` 的 StockJobType）。

> 參考：admin/src/lib/kanban-service.ts、admin/src/app/api/v1/kanban/cards/route.ts、admin/src/lib/with-permission.ts

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `admin` | ✅ | 新增 stock service / queue / routes / console 頁;修改 permissions 設定 |
| `prisma` / `common` / `worker` | ❌ | 不動 |

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/config/permissions.ts` | 修改 | 新增 STOCK_* 權限碼 |
| `admin/src/lib/stock-queue.ts` | 新增 | BullMQ producer（入列 analysis/research/digest，去重） |
| `admin/src/lib/stock-service.ts` | 新增 | 三層 service：watchlist CRUD、查訊號/報告、指令路由 |
| `admin/src/app/api/v1/stock/watchlist/route.ts` | 新增 | GET 清單 / POST 新增 |
| `admin/src/app/api/v1/stock/watchlist/[id]/route.ts` | 新增 | DELETE 移除 |
| `admin/src/app/api/v1/stock/signals/route.ts` | 新增 | GET 查訊號 |
| `admin/src/app/api/v1/stock/reports/route.ts` | 新增 | GET 查報告 |
| `admin/src/app/api/v1/stock/analyze/route.ts` | 新增 | POST 入列分析 |
| `admin/src/app/api/v1/stock/reports/generate/route.ts` | 新增 | POST 入列研究 |
| `admin/src/app/api/v1/stock/simulate/route.ts` | 新增 | POST 指令路由（/watch /signal /report /gainers） |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 新增 | 後台 console UI（置於 (dashboard) route group，URL=/stock-bot/console） |
| `admin/src/config/routes.ts` | 修改 | 新增 stockBot 路由 |
| `admin/src/layouts/hydrogen/menu-items.tsx` | 修改 | 側邊欄新增「股票機器人」選單 |
| `admin/src/app/api/v1/stock/kline/route.ts` | 新增 | GET 日K（OHLCV+MA）供畫圖 |
| `admin/src/app/(dashboard)/stock-bot/console/KlineChart.tsx` | 新增 | K 線圖元件（SVG candlestick） |
| `admin/src/app/(dashboard)/stock-bot/console/AlertsPanel.tsx` | 新增 | 警報管理面板 |

---

## 邏輯變更點

- `stock-queue.ts`：用 bullmq `Queue` + ioredis 選項;`enqueueAnalysis/Research/Digest`，jobId 去重（symbol+date）。
- `stock-service.ts`：`listWatchlist/addWatch/removeWatch/listSignals/listReports/runCommand`，全回 `ApiResult`。
- routes：`withPermission(STOCK_*)` 包裝;入列類回 jobId。
- console：client component，fetch API、聊天式輸入、表格顯示訊號/報告。

## API 合約

| 端點 | 方法 | 說明 |
| --- | --- | --- |
| `/api/v1/stock/watchlist` | GET/POST | 清單 / 新增 |
| `/api/v1/stock/watchlist/[id]` | DELETE | 移除 |
| `/api/v1/stock/signals?symbol=` | GET | 查訊號 |
| `/api/v1/stock/reports?symbol=` | GET | 查報告 |
| `/api/v1/stock/analyze` | POST | 入列分析 |
| `/api/v1/stock/reports/generate` | POST | 入列研究 |
| `/api/v1/stock/simulate` | POST | 指令路由 |

## 預期測試結果

- [ ] admin type-check 通過
- [ ] 路由具權限保護;service 回 ApiResult 不 throw

## 風險評估

- admin 引入 bullmq/ioredis（node 專用）;route handler 預設 nodejs runtime,OK。
- 缺 Redis 時入列會失敗 → service 捕捉回錯誤 ApiResult,不讓頁面崩潰。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/lib/stock-queue.ts` — Edit @ 2026-06-05 16:44
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/lib/stock-service.ts` — Edit @ 2026-06-05 16:45
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/api/v1/stock/kline/route.ts` — Write @ 2026-06-05 23:53
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/console/KlineChart.tsx` — Write @ 2026-06-05 23:53
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/console/AlertsPanel.tsx` — Write @ 2026-06-05 23:53
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/console/page.tsx` — Write @ 2026-06-05 23:55
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/config/routes.ts` — Edit @ 2026-06-06 00:24
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/layouts/hydrogen/menu-items.tsx` — Edit @ 2026-06-06 00:24
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/console/page.tsx` — Edit @ 2026-06-06 00:36
- `admin/src/config/permissions.ts` — Edit @ 2026-06-06 03:22
- `admin/src/config/routes.ts` — Edit @ 2026-06-06 03:22
- `admin/src/layouts/hydrogen/menu-items.tsx` — Edit @ 2026-06-06 03:22
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/console/KlineChart.tsx` — Edit @ 2026-06-06 03:56
- `admin/src/lib/stock-service.ts` — Edit @ 2026-06-06 08:30
- `admin/src/app/(dashboard)/stock-bot/console/page.tsx` — Edit @ 2026-06-06 08:32
- `admin/src/app/(dashboard)/stock-bot/console/KlineChart.tsx` — Edit @ 2026-06-06 08:42
- `admin/src/lib/stock-queue.ts` — Edit @ 2026-06-06 10:55
- `admin/src/app/(dashboard)/stock-bot/console/AlertsPanel.tsx` — Edit @ 2026-06-06 12:29
