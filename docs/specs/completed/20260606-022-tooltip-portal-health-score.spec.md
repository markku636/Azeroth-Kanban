# 股票機器人 — 修正欄位 tooltip 被表格裁切 + 標示健診評分計算依據

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成（程式碼完成 + type:check 通過；實機 hover 顯示待使用者確認）
> 關聯計劃書: 無（共用元件修正 + 字典內容補充，單一 admin 子專案）

---

## 目標

1. **修好 ⓘ 說明浮窗被裁切**：選股器等股票頁的欄位標題 tooltip（`InfoTooltip`）在 `overflow-x-auto` 表格容器內會被裁掉（使用者回報「滑鼠移過去被擋住了」）。改用 **portal + fixed 定位**，讓浮窗脫離 overflow 裁切，全站使用 `TermLabel` 的表格一併修好。
2. **在網頁標示「健診評分」的計算依據**：使用者問「健診評分依據什麼算出來」。把權重寫進字典 `HEALTH_SCORE` 的 `short`（tooltip + 新手導覽會顯示）與 `detail`（名詞速查頁顯示）。

## 背景

- `InfoTooltip`（`info-tooltip.tsx`）為純 CSS `position: absolute` 浮窗，渲染在 `bottom-full`（標題上方）。它被最近的 `overflow-x-auto` 祖先（選股器 `<section className="overflow-x-auto …">`）裁切——CSS 規範下 `overflow-x:auto` 會讓另一軸的 `visible` 計算為 `auto`，故縱向也裁切，浮窗在表頭上方被切掉。
- `TermLabel`（`term-label.tsx`）與 `BeginnerGuide`（`beginner-guide.tsx`）都只渲染 `entry.short`／`example`，**不渲染 `detail`**；而現有 `HEALTH_SCORE.short` 只寫「0~100 綜合體質分」，**沒有任何計算依據**，所以使用者在頁面上找不到「依據什麼算」。
- 健診評分實際算法（來源 `worker/src/ta/score.ts`）：**籌碼面 40% + 技術面 35% + 基本面 25%**，各因子 0~100 加權。
  - 籌碼面：`50 + chipBias*25`（融資減/外資增加分）
  - 技術面：規則訊號 BUY/SELL（±confidence*40）、均線多/空頭排列（±10）、RSI 超賣/超買（±5）
  - 基本面：營收 YoY、本益比、殖利率、EPS 加減分
  - 判讀：≥70（紅）偏強、≤40（綠）偏弱

`InfoTooltip` 全站被 `TermLabel` 大量使用（screener / stock 詳情 / console / market 等共 40+ 處），portal 修正一次受益全部。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 DB 變更 |
| `common` | ❌ | 無共用型別變更 |
| `admin` | ✅ | `InfoTooltip` 改 portal；`financial-glossary` 補健診評分權重文字 |

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/components/stock/info-tooltip.tsx` | 修改 | 純 CSS 浮窗 → `'use client'` + `createPortal` 到 `document.body`、`position: fixed` 依觸發點 `getBoundingClientRect()` 定位（預設標題下方、近視窗底時上翻、水平 clamp 不出視窗），脫離 overflow 裁切 |
| `admin/src/config/financial-glossary.ts` | 修改 | `HEALTH_SCORE.short` 補權重「籌碼40%＋技術35%＋基本面25%」；`detail` 列出三面向子因子 |

> `TermLabel` / `BeginnerGuide` **不需改**：它們渲染 `short`，更新字典文字即生效。

---

## 邏輯變更點

### `info-tooltip.tsx`
- 加 `'use client'`；`useState`(open) + `useRef`(觸發按鈕) + `useId`(a11y id)。
- `onMouseEnter/onFocus` 計算位置並開啟、`onMouseLeave/onBlur` 關閉。
- 開啟時 `createPortal(<span role="tooltip" style={{position:fixed, top, left, transform}} …>, document.body)`。
- 定位：`left = clamp(rect 中心, 視窗左右各留 8px)`；`top` 預設 `rect.bottom + 6`，若下方空間不足則改 `rect.top - 6` 並上翻（transform 切換）。
- 保留原視覺（`w-56 max-w-[80vw] rounded-lg border bg-white shadow-lg …`）；`z-[1000]`。
- SSR 安全：`open` 初值 false，`createPortal`/`document` 僅在使用者互動（client）後才執行。

### `financial-glossary.ts`
- `HEALTH_SCORE.short` → 含三面向權重的一句話。
- `HEALTH_SCORE.detail` → 列各面向子因子與判讀門檻。

## 回滾計劃

1. `git revert` 本 Spec commit（2 檔）。
2. 無 DB、無新依賴，回滾零風險。

## 預期測試結果

- [x] `npm run type:check` 通過（admin + worker 全綠）
- [ ] 選股器頁 hover 健診評分等欄位 ⓘ → 浮窗**完整顯示不被裁切**（含最右欄殖利率不超出視窗）
- [ ] 健診評分 ⓘ 浮窗 / 新手導覽 → 看得到「籌碼40%＋技術35%＋基本面25%」
- [ ] 其他使用 `TermLabel` 的頁（stock 詳情 / console / market）tooltip 仍正常、不破版

## 風險評估

- `InfoTooltip` 為高頻共用元件（40+ 處）→ portal 定位需處理水平 clamp 與上下翻，避免浮窗超出視窗；已於邏輯點涵蓋。
- portal 浮窗為 hover 短暫顯示，open 期間捲動不跟隨（mouseleave 即關閉）→ 可接受。
- lint/format 工具鏈於 next16 升級後失效，本次以 `type:check` 把關（見 memory：lint-format-toolchain-broken）。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認
修好欄位 tooltip 被 overflow 裁切（使用者「滑鼠移過去被擋住了」），並在頁面標示健診評分的計算依據（籌碼40/技術35/基本25）。

### 關鍵問答

#### 健診評分依據什麼算出來？
**AI 回應摘要**: 查 `worker/src/ta/score.ts` → 三面向加權（籌碼40%＋技術35%＋基本面25%），各因子 0~100。發現現有字典 `short`/`detail` 與 tooltip/新手導覽都沒寫權重，故更新字典文字使其顯示於頁面。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| `InfoTooltip` 改 portal + fixed | ✅ 採納 | 純 CSS 浮窗無法同時兼顧 x 捲動與 y 不裁切；portal 是脫離 overflow 的標準解，且全站表格一併修好 |
| 移除表格 `overflow-x-auto` | ❌ 棄用 | 會破壞窄螢幕水平捲動 / 卡片邊框 |
| 只改 `placement=bottom`（CSS） | ❌ 棄用 | 縱向可解，但最右欄仍水平裁切，治標不治本 |
| 健診評分權重寫進字典 `short`/`detail` | ✅ 採納 | `short` 同時供 tooltip + 新手導覽顯示、`detail` 供名詞速查；單一真實來源 |

### 產出摘要

**`info-tooltip.tsx`（portal 重寫）**
- 純 CSS `absolute` 浮窗 → `'use client'` + `createPortal` 到 `document.body`、`position: fixed`，脫離表格 overflow 裁切。
- `useState(coords)` + `useRef(btn)` + `useId`；hover/focus 以 `getBoundingClientRect()` 算位置、leave/blur 關閉。
- 位置：水平 `clamp` 不出視窗；預設標題下方，近視窗底時上翻（transform 切換）。常數化 `TOOLTIP_HALF_WIDTH/MARGIN/EST_HEIGHT` 避免魔法數字；保留原視覺（w-56 卡片 + shadow），`z-[1000]`。
- inline `style` 僅承載執行期座標（已加註：無法以靜態 class 表達），其餘走 Tailwind class。

**`financial-glossary.ts`（健診評分權重）**
- `HEALTH_SCORE.short` → 含「籌碼面 40%＋技術面 35%＋基本面 25%」（tooltip + 新手導覽顯示）。
- `HEALTH_SCORE.detail` → 列三面向子因子與 ≥70/≤40 門檻（名詞速查頁顯示）。

**驗證**：`npm run type:check` admin + worker 全綠。`TermLabel`/`BeginnerGuide` 未改（吃 `short`，文字更新即生效）。

<!-- AI 完成後自動更新 -->
- `admin/src/components/stock/info-tooltip.tsx` — Write @ 2026-06-06 15:35
- `admin/src/components/stock/info-tooltip.tsx` — Edit @ 2026-06-06 15:35
- `admin/src/config/financial-glossary.ts` — Edit @ 2026-06-06 15:36
