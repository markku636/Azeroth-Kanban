# 股票機器人 — 大盤頁「AI 盤勢解讀」移至頁面最上方

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: 無（UI 排序微調）

---

## 目標

將「大盤 / 類股輪動」頁的 **AI 盤勢解讀（`MarketAiReport`）** 區塊，從目前位置（新手導覽 + 國際盤 `GlobalBoard` 之下）移至頁面最上方，成為標題列下方的第一張內容卡片，讓使用者一進頁面即看到 AI 白話研判。

## 背景

使用者反映：AI 盤勢解讀是大盤頁最重要的決策資訊，但現在被排在國際盤與新手導覽之後，需要捲動才看得到。改為置頂可第一時間呈現結論。純前端 JSX 區塊順序調整，無資料流 / API / DB 變更。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 |
| `common` | ❌ | 無 |
| `admin` | ✅ | 大盤頁 JSX 區塊順序調整 |

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/(dashboard)/stock-bot/market/page.tsx` | 修改 | `<MarketAiReport />` 移至標題列 / DataSourceTag 之後、`BeginnerGuide` 之前；移除原 `GlobalBoard` 下方的渲染 |

---

## 邏輯變更點

- `StockMarketPage`：在 `{data && <DataSourceTag … />}` 之後新增 `<MarketAiReport />`（置頂）。
- 移除原本位於 `<GlobalBoard />` 與 `{data && (…)}` 之間的 `<MarketAiReport />`。
- 元件本身（`MarketAiReport` 函式）行為不變，僅渲染位置改變。

## 回滾計劃

1. 將 `<MarketAiReport />` 移回 `<GlobalBoard />` 之後即可還原。

## 預期測試結果

- [ ] 大盤頁載入後，AI 盤勢解讀卡片顯示於標題列正下方（位於新手導覽、國際盤之上）。
- [ ] 「產生 AI 解讀 / 重新產生 / 重新整理」按鈕與報告內容運作如常。
- [ ] `npm run type:check`（admin）通過。

## 風險評估

- 純 JSX 區塊重排，無狀態 / 資料流 / DB 變更，風險極低。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

使用者要求把「AI 盤勢解讀」放在大盤頁最上面。

### 產出摘要

- `StockMarketPage` 將 `<MarketAiReport />` 移至 `DataSourceTag` 之後、`BeginnerGuide` 之前（頁面最上方第一張卡片），並移除原 `GlobalBoard` 下方的渲染。`MarketAiReport` 函式本體與資料載入邏輯不變。
- 純 JSX 區塊重排：無新增/移除 import、無狀態或 API 變更；`MarketAiReport`、`GlobalBoard` 仍各被引用一次。
- `admin/src/app/(dashboard)/stock-bot/market/page.tsx` — Edit @ 2026-06-07 02:01
