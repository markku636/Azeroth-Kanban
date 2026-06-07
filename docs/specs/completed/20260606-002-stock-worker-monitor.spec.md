# 股票機器人 — 後台 Worker / Job 監控（Phase 0）

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: C:\Users\a4756\.claude\plans\ai-frolicking-fairy.md（優化計劃 Phase 0）

## 目標

後台可觀測 worker：在線狀態、各佇列數量、近期 job 與失敗重跑。解使用者痛點（後台看不到 worker 在做什麼）。

1. worker 每 30s 寫心跳到 Redis。
2. admin API：查 job 清單 + 佇列數量 + worker 心跳；失敗 job 重跑。
3. admin 監控頁 + 側邊欄入口。

## 受影響檔案

### worker
| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/heartbeat.ts` | 新增 | 每 30s `SET stock:worker:heartbeat` |
| `worker/src/index.ts` | 修改 | 啟動心跳 + 關機清理 |

### admin
| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-queue.ts` | 修改 | 加 getQueueCounts / getHeartbeat / requeue |
| `admin/src/lib/stock-service.ts` | 修改 | 加 getJobs / getQueuesStatus / retryJob |
| `admin/src/app/api/v1/stock/jobs/route.ts` | 新增 | GET 近期 job + 統計 |
| `admin/src/app/api/v1/stock/queues/route.ts` | 新增 | GET 佇列數量 + 心跳 |
| `admin/src/app/api/v1/stock/jobs/retry/route.ts` | 新增 | POST 失敗重跑 |
| `admin/src/app/(dashboard)/stock-bot/monitor/page.tsx` | 新增 | 監控頁 |
| `admin/src/config/routes.ts` | 修改 | 加 stockBot.monitor 路由 |
| `admin/src/layouts/hydrogen/menu-items.tsx` | 修改 | 選單加「機器人監控」 |
| `admin/src/locales/zh-TW.json` `en.json` | 修改 | menu.stockMonitor |

## 邏輯
- `heartbeat.ts`：`startHeartbeat()` setInterval 30s → `getRedis().set('stock:worker:heartbeat', Date.now(), 'EX', 90)`；回傳 stop 函式。
- `stock-queue.ts`：`getQueueCounts()` 對 analysis/research/digest/line-push/qa 各跑 `queue.getJobCounts()`；`getHeartbeat()` 讀 Redis key；`requeueByType(type, symbol)` 依類型重新入列。
- `stock-service.ts`：`getJobs(limit)` 讀 `AnalysisRun`（近 N + 各 status 統計）；`getQueuesStatus()` 合併 counts + 心跳（在線=心跳 < 90s）；`retryJob(id)` 找 FAILED run → 依 type+symbol 重新入列。
- 頁面：client component，定時（每 5s）輪詢 jobs/queues，顯示在線燈號、佇列卡、job 表 + 重跑鈕。

## 預期測試
- [ ] type-check 通過
- [ ] worker 啟動寫心跳；停止後心跳過期 → 監控頁顯示離線
- [ ] 跑 job → 監控頁 job 表更新；失敗 job 可重跑

## 實際變更
<!-- hook -->
## Bug Log
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/heartbeat.ts` — Write @ 2026-06-06 00:21
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/api/v1/stock/jobs/route.ts` — Write @ 2026-06-06 00:23
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/api/v1/stock/queues/route.ts` — Write @ 2026-06-06 00:23
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/api/v1/stock/jobs/retry/route.ts` — Write @ 2026-06-06 00:24
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/monitor/page.tsx` — Write @ 2026-06-06 00:24
