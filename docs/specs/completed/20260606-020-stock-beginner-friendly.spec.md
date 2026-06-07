# 股票機器人 — 全站新手友善化（名詞字典 + 浮窗 + 白話結論 + 速查頁）

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: docs/plans/doing/20260606-003-stock-beginner-friendly.md

---

## 目標

建立中央名詞字典與四個可複用元件，並套用到個股詳情 / 選股器 / 大盤 / Console 四大頁面，加上一頁「名詞速查表」，讓小白看得懂所有股票數據。對應四種形式：浮窗 ⓘ、白話結論、新手導覽面板、範例圖解。

## 背景

使用者回饋「需要更多解釋讓小白看得懂」，釐清為四頁 × 四形式全做。專案已有 `InfoTooltip`（純 CSS 浮窗）與 `data-sources.ts`（中央設定檔）兩個可複用 pattern，但名詞說明目前散落寫死。

> 參考實作：`admin/src/components/stock/info-tooltip.tsx`、`admin/src/config/data-sources.ts`、`admin/src/app/(dashboard)/stock-bot/console/StockVerdictCard.tsx`

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema 變更 |
| `common` | ❌ | 無共用型別變更 |
| `admin` | ✅ | 新增字典 / 元件 / 速查頁；四大頁面套用；route / 選單 / i18n |

## 建議開發順序

1. `admin` — 先地基（字典 + 元件/工具）→ 再速查頁 + route/選單/i18n → 最後四大頁面套用

---

## 受影響檔案

### admin — 地基（新增）

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/config/financial-glossary.ts` | 新增 | 中央名詞字典：`GlossaryEntry { term, aka?, short, detail, example? }` + `GLOSSARY` |
| `admin/src/lib/beginner-verdict.ts` | 新增 | 數值→白話結論工具函式（本益比 / 殖利率 / 健診評分 / 營收 YoY / 動作） |
| `admin/src/components/stock/term-label.tsx` | 新增 | `<TermLabel termKey>`：名詞文字 + ⓘ（內容自字典取 short/detail/example），複用 `InfoTooltip` |
| `admin/src/components/stock/plain-verdict.tsx` | 新增 | `<PlainVerdict>`：白話結論一句話彩色 chip（good/neutral/bad 三色 + emoji） |
| `admin/src/components/stock/beginner-guide.tsx` | 新增 | `<BeginnerGuide>`：可收合「📖 新手導覽」面板，吃 glossary keys 列出名詞說明 |

### admin — 名詞速查頁 + 入口

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/(dashboard)/stock-bot/glossary/page.tsx` | 新增 | 名詞速查表頁：分類列出全部名詞 + 詳解 + 範例圖解 |
| `admin/src/config/routes.ts` | 修改 | `stockBot` 加 `glossary: '/stock-bot/glossary'` |
| `admin/src/layouts/hydrogen/menu-items.tsx` | 修改 | 新增「名詞速查」選單項（`STOCK_SIGNAL_VIEW`） |
| `admin/src/locales/zh-TW.json` | 修改 | 加 `admin.menu.stockGlossary` = 名詞速查 |
| `admin/src/locales/en.json` | 修改 | 加 `admin.menu.stockGlossary` = Glossary |

### admin — 四大頁面套用（修改）

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` | 修改 | 六分頁名詞改 `TermLabel`；技術/基本面加 `PlainVerdict`；頂部加 `BeginnerGuide` |
| `admin/src/app/(dashboard)/stock-bot/screener/page.tsx` | 修改 | 既有寫死浮窗改用 `TermLabel`（接字典）；加 `BeginnerGuide` |
| `admin/src/app/(dashboard)/stock-bot/market/page.tsx` | 修改 | 大盤名詞加 `TermLabel`；頂部加 `BeginnerGuide` |
| `admin/src/app/(dashboard)/stock-bot/market/_components/global-board.tsx` | 修改 | 期現價差 / 三大法人未平倉 / 多空單 等加 `TermLabel` |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 修改 | 籌碼 / 基本面 / 訊號 / 關注清單名詞加 `TermLabel`；加 `BeginnerGuide` |

---

## 邏輯變更點

### admin

- **`financial-glossary.ts`**：匯出 `GlossaryKey` 型別、`GlossaryEntry` 介面、`GLOSSARY: Record<GlossaryKey, GlossaryEntry>`。涵蓋四類約 30+ 名詞：
  - 技術面：KD、均線 MA、MACD、RSI、乖離率、成交量、紅漲綠跌、多頭排列、黃金/死亡交叉
  - 籌碼面：融資餘額、融券餘額、外資持股、三大法人、未平倉、多單/空單、籌碼分
  - 基本面：本益比、殖利率、EPS、營收 YoY、營收 MoM
  - 大盤/期貨：加權指數、漲跌家數、類股輪動、台指期、夜盤、期現價差/基差、國際盤
  - 系統：健診評分、動作 BUY/HOLD/SELL、信心度、飆股
- **`beginner-verdict.ts`**：純函式，輸入數值回傳 `{ text: string; tone: 'good' | 'neutral' | 'bad' }`。例：`perVerdict`、`yieldVerdict`、`scoreVerdict`、`revenueYoyVerdict`、`actionVerdict`。皆對 null/undefined 回傳中性預設（遵守 coding-standards §四）。
- **`term-label.tsx`**：`{ termKey: GlossaryKey; text?: string; className?: string }`；渲染 `text ?? term` + `<InfoTooltip>`（short 為主，detail/example 補充）。
- **`plain-verdict.tsx`**：`{ tone; children }`，依 tone 給紅(bad，台股慣例)/灰(neutral)/綠… 注意台股紅=漲，故 good 用紅、bad 用綠，與全站一致；附 emoji。
- **`beginner-guide.tsx`**：`{ title?; keys: GlossaryKey[]; defaultOpen? }`；`<details>` 原生可收合，列出每個名詞的 term + short + example。
- **`glossary/page.tsx`**：Server Component，依分類 (`GLOSSARY_GROUPS`) 渲染全部名詞卡片。
- **四大頁面**：以 `TermLabel` 取代純文字標題 / 名詞；關鍵數值旁加 `PlainVerdict`；頁面頂部加 `BeginnerGuide`。

## 回滾計劃

1. 回退四大頁面、`routes.ts`、`menu-items.tsx`、locale 兩檔至上一版本
2. 刪除新增的 5 個地基檔 + `glossary/page.tsx`

## 預期測試結果

- [x] `npm run type:check` 通過（admin + worker，零錯誤）
- [ ] 四頁名詞滑過 ⓘ 顯示白話說明（桌機 hover + 手機/鍵盤 focus）— 待目視
- [ ] 本益比/殖利率/健診評分/營收YoY/動作 顯示白話結論且顏色符合台股慣例（紅好綠壞）— 待目視
- [ ] 選單出現「名詞速查」，點入可看全部名詞 + 範例 — 待目視
- [ ] 每頁「📖 新手導覽」可展開/收合 — 待目視
- [ ] 深色模式浮窗 / 面板可讀 — 待目視

## 風險評估

- 純前端、純 CSS、無資料流 / 型別破壞風險，無 DB 異動
- 浮窗 z-index 需高於表格 / 圖表（沿用既有 `z-30`）
- 既有選股器浮窗改 `TermLabel` 時須確保文案不退化（文案搬進字典）
- i18n 兩語系 key 須同步，避免缺鍵

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

<!-- 開發過程中遇到的 Bug -->

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

四頁 × 四形式全站新手友善化，以中央字典為單一來源。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 中央字典 + 元件複用 | ✅ 採納 | 單一來源、好維護、四頁共用 |
| 新增名詞速查頁 + 選單入口 | ✅ 採納 | 小白需要全站查詢入口 |
| 沿用 `InfoTooltip`（不引入 RizzUI Popover） | ✅ 採納 | 純 CSS 無依賴、手機可點、深色相容 |

### 產出摘要

**地基（5 新檔）**：`financial-glossary.ts`（33 名詞，四層深淺 term/aka/short/detail/example，含 `GLOSSARY_GROUPS` 五分類）、`beginner-verdict.ts`（perVerdict/yieldVerdict/scoreVerdict/revenueYoyVerdict/actionVerdict，純函式對 null 回中性）、`TermLabel`（名詞+ⓘ 接字典）、`PlainVerdict`（白話結論 chip，台股紅好綠壞 + 👍/👀/👎）、`BeginnerGuide`（原生 `<details>` 可收合導覽，無 'use client'）。

**速查頁 + 入口**：`/stock-bot/glossary` 速查表頁（依分類列全部名詞 + 詳解 + 範例）；`routes.ts` / `menu-items.tsx`（PiBookOpenTextDuotone）/ zh-TW + en locale 補 `stockGlossary`。

**四頁套用**：選股器（6 欄寫死浮窗 → `TermLabel` 接字典、score 加 `PlainVerdict`、加導覽 + 訊號免責）；個股詳情（六分頁切換顯示對應名詞導覽、Stat 標題改 `TermLabel`、健診/PER/殖利率/YoY/訊號動作加 `PlainVerdict`）；大盤 + global-board（TAIEX/漲跌家數/類股/國際盤/台指期/基差/三大法人/多空單/未平倉 加 `TermLabel` + 導覽）；Console（K線/籌碼/基本面/健診/訊號/關注清單名詞加 `TermLabel`、健診加 `PlainVerdict`、加導覽）。

**驗證**：`npm run type:check` admin + worker 零錯誤。IDE「th 文字為空」為靜態分析誤報（`TermLabel` 執行期會渲染文字），不影響執行與 a11y。

**待人工**：UI 目視（hover 浮窗、深色模式、導覽收合）建議實機確認。

**追加（2026-06-07）**：將大盤頁新增的 `MarketAiReport`「偏多/中性/偏空」情緒標籤從內嵌 `SENTIMENT_BADGE`（bg-red/gray/green）改用全站統一的 `PlainVerdict`（bullish→good、neutral→neutral、bearish→bad），達成白話結論視覺一致。`npm run type:check` 通過。

#### 變更檔案追蹤（Hook 自動）

- `admin/src/config/financial-glossary.ts` — Write @ 2026-06-06 14:21
- `admin/src/lib/beginner-verdict.ts` — Write @ 2026-06-06 14:21
- `admin/src/components/stock/term-label.tsx` — Write @ 2026-06-06 14:22
- `admin/src/components/stock/plain-verdict.tsx` — Write @ 2026-06-06 14:22
- `admin/src/components/stock/beginner-guide.tsx` — Write @ 2026-06-06 14:22
- `admin/src/app/(dashboard)/stock-bot/market/_components/global-board.tsx` — Edit @ 2026-06-06 14:31
