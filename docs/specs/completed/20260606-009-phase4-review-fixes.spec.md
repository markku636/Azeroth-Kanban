# 股票機器人 — Phase 4 審查修正

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: ai-frolicking-fairy.md（Phase 4 adversarial review 後修正）

## 目標
修正 Phase 4 adversarial 審查確認的問題(7 medium + 3 low;跳過 #9 failRun 全 repo 既有慣例)。

## 受影響檔案
| `worker/src/data/market.ts` | 修改 | ①排除複合類股(塑膠化工/機電/化學生技醫療) ②TAIEX OHLC 與 MI_INDEX 日期對齊 ③空資料/缺加權指數列→丟錯 ⑦行寬≤100 |
| `worker/src/queue/queues.ts` | 修改 | ⑩enqueueScreen/Market 用台北日期 dedup |
| `admin/src/lib/stock-queue.ts` | 修改 | ⑩同上(台北日期) |
| `admin/src/lib/stock-service.ts` | 修改 | ④getMarket 包 try/catch 回 ApiResult |
| `admin/src/app/(dashboard)/stock-bot/market/page.tsx` | 修改 | ⑤POST 檢查 success + 清理 setTimeout + RELOAD_DELAY_MS ⑥=== null 嚴格相等 |

## 邏輯
- 複合類股:模組常數 `COMPOSITE_SECTORS` set,排序前過濾(37→34)。
- OHLC 對齊:fetchTaiexOhlc 回傳 date;與 index.date 不符則 OHLC 設 null + log.warn。
- 失敗大聲化:rows 空 或 找不到加權指數列 → throw(processMarket 已 try/catch+failRun)。
- 台北日期:`Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'})` → YYYY-MM-DD。

## 測試
- [x] worker + admin type-check;loadMarket 驗證:sectors 34(複合已濾)、OHLC 對齊(close 在 H/L 內)、TAIEX -1.33%。

## 實際變更
- 10 項審查問題修正(複合類股排除/OHLC日期對齊/fail-loud/getMarket ApiResult/===嚴格相等/台北日期 dedup/行寬)。
