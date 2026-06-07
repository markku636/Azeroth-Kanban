# 股票機器人 — 排程時間可編輯

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成

## 目標
讓監控頁的 4 個排程(追蹤/摘要/選股/大盤)可改執行時間(HH:MM)+ 啟用/停用,並存進資料庫(worker 重啟後仍生效;admin 改動即時套用到 BullMQ scheduler)。

## ⚠️ 資料庫異動
- **新增 `schedule_config`**:key(PK,如 daily-market)、pattern(cron)、enabled(bool)、updated_at。儲存使用者覆寫的排程設定。

## 受影響檔案
| `prisma/schema.prisma` | 新增 `ScheduleConfig` model |
| `prisma/migrations/20260606170000_add_schedule_config/migration.sql` | 新增 | schedule_config 表 |
| `worker/src/jobs/scheduler.ts` | 修改 | SCHEDULES 註冊表;啟動時讀 ScheduleConfig 套用 pattern/enabled |
| `admin/src/lib/stock-queue.ts` | 修改 | EDITABLE_SCHEDULES 註冊表;applySchedule(upsert/remove JobScheduler);getSchedulerNextRuns |
| `admin/src/lib/stock-service.ts` | 修改 | getSchedulesView(registry+config+next);updateSchedule(驗證+落庫+套用) |
| `admin/src/app/api/v1/stock/schedules/route.ts` | 新增 | POST 更新排程 |
| `admin/src/app/(dashboard)/stock-bot/monitor/page.tsx` | 修改 | 每排程加時間(HH:MM)輸入 + 啟用 toggle + 儲存 |

## 邏輯
- pattern 固定 `{分} {時} * * 1-5`(平日),只編輯時/分;hour 0-23、minute 0-59 驗證。
- updateSchedule:upsert ScheduleConfig → applySchedule(enabled?upsertJobScheduler:removeJobScheduler)。
- worker 啟動:讀 ScheduleConfig,有覆寫用覆寫 pattern,disabled 則 remove;否則用預設。
- getSchedulesView:registry 為清單來源,附 DB pattern/enabled + BullMQ next(下次執行)。

## 測試
- [ ] type-check;E2E:改大盤排程時間 → BullMQ next 更新 → ScheduleConfig 落庫 → worker 重啟仍生效。

## 實際變更
<!-- hook -->
## Bug Log
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/prisma/migrations/20260606170000_add_schedule_config/migration.sql` — Write @ 2026-06-06 06:34
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/api/v1/stock/schedules/route.ts` — Write @ 2026-06-06 06:36
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/monitor/page.tsx` — Edit @ 2026-06-06 06:36
