# 股票機器人 — 個股整合詳情頁(Phase 5)

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: ai-frolicking-fairy.md（優化計劃 Phase 5）

## 目標
單一個股整合頁 `/stock-bot/stock/[symbol]`,分頁式整合 技術(K線+籌碼)/ 基本面 / 訊號 / 報告 / 新聞,可從選股器/console 點進。報價 header 紅漲綠跌 + 健診評分。重用既有 API。

## 受影響檔案
| `admin/src/lib/stock-service.ts` | 修改 | 新增 getStockNews(FinMind TaiwanStockNews 近 7 日) |
| `admin/src/app/api/v1/stock/news/route.ts` | 新增 | GET 個股新聞 |
| `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` | 新增 | 個股詳情頁(分頁) |
| `admin/src/app/(dashboard)/stock-bot/screener/page.tsx` | 修改 | 代號 → 詳情頁連結 |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 修改 | 關注清單代號 → 詳情頁連結 |

## 邏輯
- 詳情頁 client component,`useParams()` 取 symbol;mount 並行 fetch kline/chips/fundamental/signals?symbol/reports?symbol/news?symbol。
- Header:名稱+代號+最新收盤+漲跌%(由 kline 末兩點算)+健診評分 badge。
- 分頁:技術(KlineChart 日/週/月 + 籌碼摘要列)/ 基本面(評分因子)/ 訊號 / 報告 / 新聞。
- getStockNews:直接打 FinMind(admin 可連外),TaiwanStockNews 不傳 end_date,取近 20 則。

## 測試
- [ ] type-check;E2E:/stock-bot/stock/2330 顯示報價+各分頁;選股器代號可點進。

## 實際變更
<!-- hook -->
## Bug Log
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/api/v1/stock/news/route.ts` — Write @ 2026-06-06 08:10
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` — Write @ 2026-06-06 08:12
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/screener/page.tsx` — Edit @ 2026-06-06 08:12
