# 股票機器人 — 股票名稱 + K 線圖升級

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: ai-frolicking-fairy.md（UI 體驗強化）

## 目標
1. **股票名稱**:全面顯示「代號 + 名稱」(2330 台積電)。FinMind TaiwanStockInfo(免費,4136 檔)。
2. **K 線圖升級**:換成 TradingView `lightweight-charts`,加 **日/週/月切換** + 成交量 + MA5/20/60 + 十字游標/縮放。

## 受影響檔案
### prisma
| `prisma/schema.prisma` | 新增 `StockInfo`(symbol, name, industry) |
| `prisma/migrations/20260606160000_add_stock_info/migration.sql` | 新增 | stock_info 表 |
| `admin/src/app/(dashboard)/stock-bot/about/page.tsx` | 新增 | 資料來源說明頁 |

### worker
| `worker/src/data/stockInfo.ts` | 新增 | loadAllStockInfo(TaiwanStockInfo→upsert 全市場) + ensureStockName |
| `worker/src/jobs/analysis.ts` | 修改 | 分析時確保該股 name 入庫 |

### admin
| `admin/package.json` | 修改 | 加 lightweight-charts |
| `admin/src/lib/stock-service.ts` | 修改 | getScreener/listSignals/getKline 附 name;extend getKline 回更多日K |
| `admin/src/app/(dashboard)/stock-bot/console/KlineChart.tsx` | 修改 | 改用 lightweight-charts(日/週/月、量、MA) |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 修改 | 顯示名稱 + 傳 period |
| `admin/src/app/(dashboard)/stock-bot/screener/page.tsx` | 修改 | 名稱欄 |

## 邏輯
- `StockInfo`：symbol→name 對照;`loadAllStockInfo` 一次抓全市場 upsert;`ensureStockName(symbol)` 缺則補單檔。
- admin：查多筆 symbol 的 name 做成 Map,附到 screener rows / signals / kline 回應。
- getKline：回傳延長至 ~250 日(供月K),前端依 period 聚合 日/週/月。
- KlineChart：`createChart` + candlestickSeries + volume histogram + MA line series;period 按鈕(日/週/月)client 端聚合。

## 測試
- [ ] type-check;E2E:名稱顯示、K線可切日/週/月

## 實際變更
<!-- hook -->
## Bug Log
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/prisma/migrations/20260606160000_add_stock_info/migration.sql` — Write @ 2026-06-06 03:49
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/data/stockInfo.ts` — Write @ 2026-06-06 03:49
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/screener/page.tsx` — Edit @ 2026-06-06 03:54
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/about/page.tsx` — Write @ 2026-06-06 03:55
