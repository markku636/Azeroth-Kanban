# 股票 AI 機器人 — 警報引擎（Alert）

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: C:\Users\a4756\.claude\plans\ai-frolicking-fairy.md（P1 功能）
> 前置 Spec: 20260605-001/002/003/004

## 目標

P1 警報引擎：使用者設定條件（價格突破、RSI 超買超賣），分析時自動檢查並推播。

1. Prisma `Alert` model + migration。
2. worker：`evaluateAlert`（純函式，可測）+ `runAlertChecks`（接 analysis 流程，觸發 line-push + 更新 lastTriggeredAt，當日去重）。
3. admin：alerts CRUD API + service。

## 受影響檔案

### prisma
| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `prisma/schema.prisma` | 修改 | 新增 Alert model + Member 關聯 |
| `prisma/migrations/20260606120000_add_alert/migration.sql` | 新增 | alert 資料表 |

### worker
| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/alerts.ts` | 新增 | evaluateAlert + runAlertChecks |
| `worker/src/alerts.test.ts` | 新增 | evaluateAlert 單元測試 |
| `worker/src/jobs/analysis.ts` | 修改 | 分析後跑 runAlertChecks |

### admin
| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-service.ts` | 修改 | listAlerts / addAlert / removeAlert |
| `admin/src/app/api/v1/stock/alerts/route.ts` | 新增 | GET/POST |
| `admin/src/app/api/v1/stock/alerts/[id]/route.ts` | 新增 | DELETE |

## 邏輯
- Alert：member_id, symbol, type(PRICE_ABOVE/PRICE_BELOW/RSI_ABOVE/RSI_BELOW), threshold(Float), is_active, last_triggered_at。
- `evaluateAlert(alert, { lastClose, rsi })` → boolean（純函式）。
- `runAlertChecks(symbol, ctx)`：取該 symbol active alerts → evaluate → 達成且當日未觸發 → enqueue line-push（給該 member 綁定的 LINE 訂閱者）+ 更新 last_triggered_at。
- analysis.ts：算完 indicators/signal 後呼叫。

## 預期測試
- [ ] evaluateAlert 四型別正確
- [ ] type-check / 既有測試不破

## 實際變更
<!-- hook -->
## Bug Log
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/prisma/migrations/20260606120000_add_alert/migration.sql` — Write @ 2026-06-05 16:48
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/alerts.ts` — Write @ 2026-06-05 16:49
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/alerts.test.ts` — Write @ 2026-06-05 16:50
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/api/v1/stock/alerts/route.ts` — Write @ 2026-06-05 16:50
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/api/v1/stock/alerts/[id]/route.ts` — Write @ 2026-06-05 16:50
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/alerts.ts` — Edit @ 2026-06-06 00:34
- `worker/src/alerts.ts` — Edit @ 2026-06-06 16:28
