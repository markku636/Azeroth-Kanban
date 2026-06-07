# 股票機器人 — 代號改用真正可搜尋下拉選單

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成

## 問題
native `<datalist>` 對 3097 檔體驗差(只顯示符合目前輸入值的少量提示,無法瀏覽/清楚下拉)。使用者回報「還是不能下拉」。

## 解法
自製可搜尋下拉元件 `StockCombobox`:input + 絕對定位下拉清單(可滾動 max-h),打**代號或名稱**即時過濾(取前 50),點選即回填並觸發。點外部關閉。

## 受影響檔案
| `admin/src/app/(dashboard)/stock-bot/console/StockCombobox.tsx` | 新增 | 可搜尋下拉元件 |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 修改 | K線代號 + 關注清單改用 StockCombobox;移除 datalist |

## 邏輯
- 過濾:`symbol.includes(q) || name.toLowerCase().includes(q)`,空字串顯示前 50。
- 選取:onSelect(symbol);K線→setChartSymbol+loadChart;關注清單→addWatch(symbol)。
- 點外部(mousedown)關閉下拉。

## 測試
- [ ] type-check;E2E:點開下拉有清單、打「台積」過濾出 2330、選取載入。

## 實際變更
<!-- hook -->
## Bug Log
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/(dashboard)/stock-bot/console/StockCombobox.tsx` — Write @ 2026-06-06 06:27
