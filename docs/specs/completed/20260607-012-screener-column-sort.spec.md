# 股票機器人 — 選股器表格點擊欄位排序

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: 無

---

## 目標

讓選股器 / 飆股雷達表格的欄位表頭可點擊排序：點一下依該欄升冪、再點一下降冪、第三下回到預設（策略原始排序）。

## 背景

目前表格固定依策略排序（評分降冪或策略自訂 `sort`），使用者無法自行依「本益比」「殖利率」「營收YoY」等欄位重新排列。使用者希望「點擊欄位即可排序」。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 |
| `common` | ❌ | 無 |
| `admin` | ✅ | 選股器頁加入 client-side 欄位排序 |

## 建議開發順序

1. `admin` — 選股器頁 `page.tsx` 加入排序狀態與表頭點擊

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/(dashboard)/stock-bot/screener/page.tsx` | 修改 | 加入排序 state、可點擊表頭、排序後 rows derived |

---

## 邏輯變更點

### admin

- 新增 `sortKey` / `sortDir` state（`null` 代表用策略預設排序）。
- 抽出可排序基礎欄位的取值對照（symbol / name / score / chipScore / per / revenueYoy / dividendYield）。
- 以 `useMemo` 計算 `sortedRows`：無 sortKey → 維持伺服器順序；有 sortKey → 依型別（數字 / 字串）排序，`null` 一律墊底。
- 表頭加入點擊處理：同欄三段循環 asc → desc → 取消；顯示排序箭頭。
- 序號欄 `#` 依排序後順序重編。

## 回滾計劃

1. 回退 `page.tsx` 至上一版本。

## 預期測試結果

- [ ] 點擊「本益比」「殖利率」「營收YoY」「健診評分」「籌碼分」可正確升/降冪排序
- [ ] 第三次點擊回到策略預設排序
- [ ] `null` 欄位值排序時墊底，不報錯
- [ ] 切換策略 / 評分時排序狀態合理（沿用或重置皆不 crash）

## 風險評估

- 純前端 client-side 排序，不影響 API 與既有資料，風險低。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

選股器表格表頭可點擊排序（升/降/取消三段切換）。

### 產出摘要

<!-- 完成後更新 -->
- `admin/src/app/(dashboard)/stock-bot/screener/page.tsx` — Edit @ 2026-06-07 03:30
