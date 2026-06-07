# 股票機器人 — 選股器欄位說明浮窗（小白友善）

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: 無

---

## 目標

在選股器 / 飆股雷達表格的欄位標題加上「ⓘ」說明浮窗，讓不熟股市的使用者滑鼠移上去（或手機點擊）即可看到該欄位的白話解釋，重點涵蓋使用者詢問的「動作 / 籌碼分 / 本益比」三欄，並一併補上其餘指標欄位。

## 背景

使用者反映選股器表頭的「動作 / 籌碼分 / 本益比」看不懂，希望有更多描述。專案已有純 CSS（無額外依賴）的浮窗 pattern 可複用。

> 參考實作：`admin/src/app/(dashboard)/stock-bot/console/KlineChart.tsx`（圖例說明浮窗，group-hover / group-focus-within）

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema 變更 |
| `common` | ❌ | 無共用型別變更 |
| `admin` | ✅ | 新增 InfoTooltip 元件 + 選股器頁面欄位標題套用 |

## 建議開發順序

1. `admin` — 新增 `info-tooltip.tsx`，再於選股器頁面套用

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/components/stock/info-tooltip.tsx` | 新增 | 可複用的純 CSS 說明浮窗（ⓘ 圖示 + tooltip 內容） |
| `admin/src/app/(dashboard)/stock-bot/screener/page.tsx` | 修改 | 欄位標題（健診評分/動作/籌碼分/本益比/營收YoY/殖利率）加上 InfoTooltip |

---

## 邏輯變更點

### admin

- `info-tooltip.tsx`：匯出 `InfoTooltip`，props 為 `{ label?: string; children: ReactNode }`；以 `group relative` + `group-hover/group-focus-within` 控制顯示，桌機滑過、手機點擊聚焦皆可顯示，無 JS 狀態。
- `screener/page.tsx`：把純文字 `<th>` 標題改為「文字 + `<InfoTooltip>` 說明」。各欄說明文案：
  - 健診評分：0~100 綜合體質分，越高越強（紅字 ≥70 / 綠字 ≤40）
  - 動作：技術面機械訊號 BUY/HOLD/SELL，由均線、MACD、RSI、KD 等加權判定，非投資建議
  - 籌碼分：法人/融資籌碼面子分數，越高代表外資買超/融資減等偏正向
  - 本益比：股價 ÷ EPS，越低通常越便宜，須同產業比較；0 或極大值多為 EPS 失真
  - 營收YoY：營收年增率，正（紅）為成長
  - 殖利率：現金股利 ÷ 股價

## 回滾計劃

1. 回退 `screener/page.tsx` 至上一版本
2. 刪除 `info-tooltip.tsx`

## 預期測試結果

- [ ] 桌機滑鼠移到欄位「ⓘ」顯示說明，移開消失
- [ ] 手機/鍵盤聚焦 ⓘ 時顯示說明
- [ ] `npm run type:check` 通過
- [ ] 深色模式下浮窗可讀

## 風險評估

- 純前端、純 CSS，無資料流/型別風險
- z-index 需高於表格避免被遮蔽

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

選股器表頭加白話說明浮窗，解決使用者看不懂「動作/籌碼分/本益比」的問題。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 抽出可複用 InfoTooltip 元件（沿用 KlineChart 的純 CSS pattern） | ✅ 採納 | 選股器一次 6 欄使用，達到複用門檻；無新增依賴 |

### 產出摘要

- 新增 `InfoTooltip`（純 CSS，group-hover / group-focus-within，無 JS 狀態、無依賴），沿用 KlineChart 圖例浮窗 pattern。
- 選股器表頭 6 欄（健診評分 / 動作 / 籌碼分 / 本益比 / 營收YoY / 殖利率）加上「ⓘ」白話說明。
- `npm run type:check` 通過（admin + worker 皆無錯誤）。
- 變更檔案：`admin/src/components/stock/info-tooltip.tsx`（新增）、`admin/src/app/(dashboard)/stock-bot/screener/page.tsx`（修改）。
