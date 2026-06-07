# 股票機器人 — 修正手動「分析/研究」無作用 + 代號下拉

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成

## 問題
Console 關注清單的「分析/研究」按鈕點了沒反應。根因:① 手動觸發用 `analysis:{symbol}:{今日}` dedup jobId,當天若已被股池掃描跑過 → BullMQ 視為重複,不再處理(worker log 無紀錄);② 前端點擊後無任何回饋;③ **追加根因**:BullMQ custom jobId 不可含 `:`(丟 "Custom Id cannot contain :")。

## 受影響檔案
| `admin/src/lib/stock-queue.ts` | 修改 | enqueueAnalysis/enqueueResearch 加 `force`;**jobId `:`→`-`**(dedup/force/retry 全改) |
| `worker/src/queue/queues.ts` | 修改 | dedupJobId `:`→`-` |
| `admin/src/lib/stock-service.ts` | 修改 | triggerAnalysis/triggerResearch 帶 force=true;新增 getStockList() |
| `admin/src/app/api/v1/stock/list/route.ts` | 新增 | GET 全市場代號+名稱(供下拉) |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 修改 | 分析/研究 訊息+延遲刷新;代號改 datalist 可搜尋下拉 |

## 邏輯
- force:jobId = `manual-analysis-{symbol}-{ts}` → 必定重跑(不受當日 dedup 阻擋)。
- 前端:`analyze`/`research` 設 watchMsg(處理中 + 失敗顯示 message)+ setTimeout refresh(分析 10s、研究 45s)。
- 下拉:`<datalist id="stock-list">` 載入 StockInfo 3097 檔(value=`代號 名稱`),代號/名稱皆可搜尋;parseSymbol 取 4 碼。

## 測試
- [x] type-check;analyze API 200 success(jobId manual-analysis-2330-…);新 AnalysisRun DONE;stock-list 3097;datalist 3097 options。

## 實際變更
- jobId 全面 `:`→`-`(BullMQ 保留 `:`);手動分析/研究 force 唯一 jobId;代號 datalist 下拉。
