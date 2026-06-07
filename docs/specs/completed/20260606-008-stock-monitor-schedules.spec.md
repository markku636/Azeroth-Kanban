# 股票機器人 — 監控頁:排程(未來) + 完成摘要

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: ai-frolicking-fairy.md（Phase 0 監控強化）

## 目標
後台監控頁讓使用者看得到:① **未來要做什麼**(BullMQ Job Scheduler 排程 + 下次執行時間);② **完成了什麼**(近期 Job 加「結果摘要」欄,從 AnalysisRun.output 萃取)。

## 受影響檔案
### admin
| `admin/src/lib/stock-queue.ts` | 修改 | 新增 `getSchedules()`(讀 dispatch/digest/screen 佇列的 JobScheduler + next) |
| `admin/src/lib/stock-service.ts` | 修改 | getQueuesStatus 附 schedules;getJobs 每筆附中文 `summary` |
| `admin/src/app/(dashboard)/stock-bot/monitor/page.tsx` | 修改 | 新增「排程任務(未來)」卡;近期 Job 加「結果」欄 |

## 邏輯
- `getSchedules`:對 `['dispatch', digest, screen]` 佇列呼叫 `getJobSchedulers(0,-1,true)`,取 key/pattern/next/tz;key→中文 label(daily-track=追蹤關注股、daily-digest=漲幅摘要、daily-screen=股池掃描);依 next 升冪。
- `jobSummary(type, output)`:analysis→`{action} 信心{confidence}（推播N）`;screen→`派發 N 檔`;digest→`漲幅榜 N 檔`;research→報告已生成;qa→已回答。
- 監控頁:排程卡顯示 label + 下次執行(localized) + cron;Job 表加結果欄。

## 測試
- [ ] type-check;E2E:監控頁顯示 3 筆排程(含下次14:00/13:50)+ Job 結果欄(analysis 顯示 HOLD/BUY 信心、screen 顯示派發44檔)

## 實際變更
<!-- hook -->
## Bug Log
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/monitor/page.tsx` — Edit @ 2026-06-06 04:45
