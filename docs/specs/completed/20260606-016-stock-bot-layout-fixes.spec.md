# 股票機器人 — 後台排版批次修正

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 規模: 中型（單一子專案 admin，6 檔，純前端排版，無資料/邏輯/schema 變更）

## 目標

承接使用者回報「排版跑了」（K 線圖標題「2330 台積電」與後方輸入框過擠，已先以 `mr-3` 修正）。
進一步以多代理審查 stock-bot 全部 10 個 UI 檔，對抗式驗證後確認 11 處真實且修法安全的排版瑕疵，一次修齊。

僅調整 Tailwind className（少數加橫向捲動容器 / `title` 屬性），不動 JSX 邏輯、不動資料流、不動 schema。

## 背景

- 審查範圍：`admin/src/app/(dashboard)/stock-bot/` 下全部 `.tsx`。
- 36 個原始發現 → 對抗式驗證（isReal && fixIsSafe）→ 11 個確認、25 個排除（多為「父層已處理 / CJK 自然換行 / 前提誤判」的吹毛求疵）。
- 不採納清單：訊號表橫向捲動、關注清單名稱欄 truncate、AlertsPanel 多項防禦性 min-w-0/shrink-0、StockVerdictCard 文字換行、KlineChart 圖例 gap、詳情頁卡片間距 / DataSourceTag mt 等（理由詳見驗證紀錄）。

## 受影響檔案

| 檔案 | 異動 | 說明 |
| --- | --- | --- |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 修改 | 訊號表說明欄斷字 / 研究報告標題+摘要斷字（K 線標題間距已修） |
| `admin/src/app/(dashboard)/stock-bot/console/AlertsPanel.tsx` | 修改 | 空狀態列補 border/內距與資料列一致 |
| `admin/src/app/(dashboard)/stock-bot/console/StockCombobox.tsx` | 修改 | 下拉選項改 flex + 股名 truncate，避免長中文股名折行錯位 |
| `admin/src/app/(dashboard)/stock-bot/screener/page.tsx` | 修改 | 9 欄表加橫向捲動容器 + 儲存格水平內距 |
| `admin/src/app/(dashboard)/stock-bot/monitor/page.tsx` | 修改 | 表格內距 / 結果欄 truncate / Worker 狀態列 flex-wrap |
| `admin/src/app/(dashboard)/stock-bot/about/page.tsx` | 修改 | 資料表加橫向捲動容器 + 表頭內距一致 |

## 實作細節（11 處）

1. console `page.tsx` 訊號「說明」欄：`text-gray-600` → `max-w-xs break-words text-gray-600`
2. console `page.tsx` 研究報告標題/摘要：加 `break-words`
3. `AlertsPanel.tsx` 空狀態 `<li>`：加 `rounded border px-3 py-2`
4. `StockCombobox.tsx` 選項 button 改 `flex items-baseline gap-2`；代號 span 加 `shrink-0`；股名 span 移除 `ml-2`、加 `min-w-0 truncate`
5. `screener/page.tsx` section 加 `overflow-x-auto`，table 加 `min-w-[640px]`（窄螢幕橫向捲動）
6. `screener/page.tsx` thead/tbody 列加 `[&>th]:px-2 [&>th]:py-1` / `[&>td]:px-2 [&>td]:py-1`
7. `monitor/page.tsx` job 表 thead/tbody 列加 `[&>th]:px-2 [&>th]:py-1` / `[&>td]:px-2 [&>td]:py-1`
8. `monitor/page.tsx` 「結果」欄：`text-gray-600` → `max-w-xs truncate text-gray-600` + `title={j.summary ?? ''}`
9. `monitor/page.tsx` Worker 狀態列：`flex items-center gap-3` → 加 `flex-wrap`
10. `about/page.tsx` section 加 `overflow-x-auto`，table 加 `min-w-[640px]`
11. `about/page.tsx` thead/tbody 列加 `[&>th]:px-3 [&>th]:py-2` / `[&>td]:px-3 [&>td]:py-2`

## 驗收條件

- [x] `npm run type:check` 通過（admin + worker 皆無錯誤）
- [ ] 桌機檢視：各表格 / 下拉 / 卡片版面正常，無破圖
- [ ] 窄螢幕：選股器 / 資料來源表可橫向捲動；Worker 離線提示可換行

## 風險評估

低。皆為 Tailwind className 與容器包裝層級的調整，無邏輯與資料變更；class 排序交由 prettier-plugin-tailwindcss。

## AI 協作紀錄

### 目標確認

把使用者口頭「排版跑了」擴大為一次 stock-bot 全頁排版健檢，並只落實「確認為真且修法安全」的調整。

### 關鍵問答

- 為何不全修 36 項？→ 25 項經對抗式驗證為 isReal=false 或 fixIsSafe=false（父層已處理 / CJK 自然換行 / 前提與程式碼不符），強修反而引入無效死碼或過度留白。

### 產出摘要

11 處排版修正全數套用，`type:check` 通過：

- **console**：訊號說明欄 `max-w-xs break-words`；研究報告標題/摘要 `break-words`；警報空狀態列補 `rounded border px-3 py-2`；下拉選項改 `flex items-baseline gap-2` + 代號 `shrink-0` + 股名 `min-w-0 truncate`（解決長中文股名折行錯位）。
- **screener**：section `overflow-x-auto` + table `min-w-[640px]`（9 欄窄螢幕可橫向捲動）；thead/tbody 補儲存格水平內距。
- **monitor**：job 表補儲存格內距；結果欄 `max-w-xs truncate` + `title`；Worker 狀態列加 `flex-wrap`（離線長提示可換行）。
- **about**：資料表 section `overflow-x-auto` + `min-w-[640px]`；表頭/內容列內距一致。

設計取捨：橫向捲動掛在 `section`（非另包 `<div>`）以避免整張表大幅重排縮排，捲動行為等同。下拉選項採「代號 shrink-0 + 股名 truncate」整套，而非只改 button（單改 button 會 gap/ml 雙重間距且 truncate 不生效）。

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

- `admin/src/app/(dashboard)/stock-bot/console/StockCombobox.tsx` — Edit @ 2026-06-06 12:29
- `admin/src/app/(dashboard)/stock-bot/screener/page.tsx` — Edit @ 2026-06-06 12:30
- `admin/src/app/(dashboard)/stock-bot/about/page.tsx` — Edit @ 2026-06-06 12:30
