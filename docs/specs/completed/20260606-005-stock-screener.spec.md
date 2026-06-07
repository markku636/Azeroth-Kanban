# 股票機器人 — 選股器 / 飆股雷達(Phase 3)

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: ai-frolicking-fairy.md（優化計劃 Phase 3）

## 目標

用既有多因子評分(score)對「股池」排行 + 策略篩選，做選股器 + 飆股雷達 + 每日推薦。
重用 Phase 0~2 的資料(AnalysisSignal.score、StockFundamental、StockChip)。

> FinMind 600/hr 限制 → 先用「台灣50 + 熱門 + watchlist」股池(~40 檔)夜間批次,不掃全市場。

## 受影響檔案
### common
| `common/src/stock-types.ts` `index.ts` | 修改 | `StockJobType.SCREEN` |

### worker
| `worker/src/data/pool.ts` | 新增 | STOCK_POOL（台灣50/熱門 種子清單）|
| `worker/src/jobs/screen.ts` | 新增 | processScreen：對股池入列 analysis(填評分)|
| `worker/src/queue/queues.ts` | 修改 | screen 佇列 + enqueueScreen |
| `worker/src/jobs/workers.ts` | 修改 | 註冊 screen worker |
| `worker/src/jobs/scheduler.ts` | 修改 | 盤後 13:50 跑 screen |

### admin
| `admin/src/lib/stock-queue.ts` | 修改 | enqueueScreen |
| `admin/src/lib/stock-service.ts` | 修改 | getScreener(strategy)、triggerScreen() |
| `admin/src/app/api/v1/stock/screener/route.ts` | 新增 | GET 排行結果 |
| `admin/src/app/api/v1/stock/screen/route.ts` | 新增 | POST 觸發掃描 |
| `admin/src/app/(dashboard)/stock-bot/screener/page.tsx` | 新增 | 選股器頁 |
| `admin/src/config/routes.ts` `menu-items.tsx` `locales` | 修改 | 選單入口 |

## 邏輯
- `getScreener(strategy, limit)`：讀「每檔最新 AnalysisSignal(含 score)」join StockFundamental/StockChip → 套策略 filter → 依 score 排序。
  - 策略：`momentum`(飆股雷達:action≠SELL 且 score 高)、`value`(本益比<20 且 營收YoY>0)、`chips`(融資減/外資增 bias>0)、`all`(純評分排行)。
- `screen` job：對 STOCK_POOL 每檔 `enqueueAnalysis`(去重)→ analysis 會算 score。
- 選股器頁:策略下拉 + 排行表(代號/評分/動作/本益比/YoY/籌碼)+「立即掃描股池」按鈕。

## 測試
- [ ] type-check
- [ ] E2E:觸發掃描 → 股池評分落庫 → 選股器排行顯示

## 實際變更
<!-- hook -->
## Bug Log
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/data/pool.ts` — Write @ 2026-06-06 03:18
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/jobs/screen.ts` — Write @ 2026-06-06 03:19
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/api/v1/stock/screener/route.ts` — Write @ 2026-06-06 03:21
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/api/v1/stock/screen/route.ts` — Write @ 2026-06-06 03:21
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/screener/page.tsx` — Write @ 2026-06-06 03:21
