# 股票機器人 — K 線圖均線跌破標示 + 半年線 + 均線狀態列

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: 無（延續 20260606-014/015/016「讓小白看懂 K 線」系列）

---

## 目標

讓使用者在 K 線圖上一眼看出「股價跌破了哪些均線」——跌破 5 日線、月線(20)、季線(60)、半年線(120)，這是台股常見偏空訊號。同時補上目前缺少的**半年線(MA120)**，並在圖表上方放一排「站上/跌破」紅綠燈狀態列。

## 背景

延續 14（紅綠燈結論卡）/ 15（圖例浮窗）/ 16（買賣箭頭）。沿用 lightweight-charts v4 `series.setMarkers()`，純前端、無資料/後端變更。

現況（`admin/src/app/(dashboard)/stock-bot/console/KlineChart.tsx`）：
- 已畫 MA5(藍 `#3b82f6`)/MA20 月線(橙 `#f59e0b`)/MA60 季線(紫 `#a855f7`)，由前端從聚合後收盤價即時重算（`sma(closes, p, i)`）。
- 缺半年線(MA120)。
- 已有買/賣箭頭 `computeKdMarkers()` → `candles.setMarkers()`。整張圖 `setMarkers` 只能呼叫一次 → 跌破箭頭須與買賣箭頭**合併成同一個依時間排序的陣列**。
- `getKline` 預設抓 300 天日 K，足夠算 120 日均線。

使用者已確認決策：
1. **新增半年線(MA120)**。
2. 呈現方式：**箭頭 + 狀態列兩者都要**。
3. 跌破偵測範圍：**全部 5/20/60/120 都標在 K 棒上**（MA5 較頻繁、圖會較密，使用者接受）。

設計重點：
- 「跌破」＝收盤價由上向下穿越均線：前一根 `close ≥ MA` 且當根 `close < MA`（`MA`/`prevMA` 皆非 null）。
- 全部在前端用聚合後 `agg` 收盤價計算，與既有 MA 線同源；**不動 server / schema / API**。
- 「月線/季線/半年線」命名只在日線有意義 → **跌破箭頭與狀態列只在 `period === 'day'` 顯示**；MA 線本身（含新加 120）四週期皆畫，資料不足自動為 null 被濾掉（與既有 MA5/20/60 行為一致）。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | **無 DB 變更** |
| `common` | ❌ | 無 |
| `admin` | ✅ | 均線跌破/狀態純函式 + KlineChart 畫線/標記/狀態列/圖例 |

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/ma-signals.ts` | 新增 | `MA_CONFIGS` + `computeMaBreakMarkers(bars, periods)` + `computeMaStatus(bars, periods)`（純函式，吃 `Bar[]`） |
| `admin/src/app/(dashboard)/stock-bot/console/KlineChart.tsx` | 修改 | 新增 MA120 線；跌破箭頭與 KD 買賣箭頭合併 `setMarkers`；圖上方均線狀態列；圖例/浮窗補 MA120 與跌破說明 |

---

## 邏輯變更點

### admin

- `ma-signals.ts`（新檔，零依賴）：
  - `MA_CONFIGS`：`{ period, label, breakText, color }[]` — 5/`5日線`/`破5`/`#3b82f6`、20/`月線`/`破月`/`#f59e0b`、60/`季線`/`破季`/`#a855f7`、120/`半年線`/`破半年`/`#db2777`。
  - 內聯 `sma(values, period, idx)`（與 KlineChart/stock-service 同公式）。
  - `computeMaBreakMarkers(bars, periods): { date, period, breakText, color }[]`：逐均線逐根偵測 `prevClose ≥ prevMa && close < ma`。
  - `computeMaStatus(bars, periods): { period, label, state: 'above'|'below'|'unknown', maValue }[]`：取最後一根逐均線判定（ma 為 null → `unknown`）。
- `KlineChart.tsx`：
  - `addMa(120, '#db2777')`（接在 60 後）。
  - `period === 'day'` 時 `computeMaBreakMarkers(agg, [5,20,60,120])` map 成 `SeriesMarker<Time>`（`aboveBar` / `arrowDown` / `color: 該均線色` / `text: breakText`），**與 `computeKdMarkers` 結果合併、依 `time` 排序**後一次 `candles.setMarkers()`。
  - `period === 'day'` 時圖表上方渲染 `computeMaStatus` 紅綠燈 chip：站上=綠✓、跌破=紅✗、資料不足=灰。
  - 圖例加 MA120(半年線) 色鍵；浮窗補一行「半年線」與「向下箭頭=跌破均線」說明。

## 回滾計劃

1. 還原 KlineChart 的 MA120 線/跌破標記合併/狀態列/圖例補充；刪除 `ma-signals.ts`。無 DB / 依賴變更。

## 預期測試結果

- [x] `npm run type:check` 通過（admin / worker / common 全綠）
- [ ] 實機（2330 詳情頁 → 技術 Tab，日線）：出現半年線、跌破當天 K 棒上方向下箭頭(破5/破月/破季/破半年)、圖上方站上/跌破狀態列 ← 待使用者於 dev 確認
- [ ] 切週/月：MA120 線仍在，但跌破箭頭與狀態列消失（語意防呆）← 待確認
- [ ] console 頁同一 `<KlineChart>` 同步生效 ← 待確認

## 風險評估

- MA5 跌破頻繁 → 圖較密；使用者已確認接受。月/季/半年線跌破頻率低。
- 多種標記同日（大跌一次穿多條均線）會堆疊 → lightweight-charts 自動垂直堆疊，可接受。
- marker 時間須等於某根 K 棒時間 → 以 `agg` 的 bar date 產生，必對齊。
- 週/月週期下 120 期資料不足 → sma 回 null 被濾掉，與既有 MA60 同行為。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認
在 K 線圖標出跌破 5/月/季/半年線，補上半年線(MA120)，並在圖上方放站上/跌破紅綠燈狀態列。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 新增半年線 MA120 | ✅ 採納 | 使用者要求；長線重要參考 |
| 箭頭 + 狀態列兩者都要 | ✅ 採納 | 圖上看歷史跌破點，狀態列看當前位置 |
| 全部 5/20/60/120 都標跌破箭頭 | ✅ 採納 | 使用者接受 MA5 較密 |
| 跌破箭頭/狀態列只在日線顯示 | ✅ 採納 | 月線/季線/半年線命名僅日線有意義，週/月語意錯亂 |
| 純前端計算、不動 server/schema | ✅ 採納 | MA 線本就前端重算；最小變更 |

### 產出摘要
- `admin/src/lib/ma-signals.ts`（新檔）：`MA_CONFIGS`（5/20/60/120 + 名稱/破X文字/色）、`computeMaBreakMarkers(bars, periods)`（逐均線偵測 `prevClose ≥ prevMa && close < ma`）、`computeMaStatus(bars, periods)`（最後一根判 above/below/unknown）。內聯 `sma` 與 KlineChart/stock-service 同公式。
- `KlineChart.tsx`：
  - `addMa(120, '#db2777')` 新增半年線。
  - 跌破箭頭 `computeMaBreakMarkers(agg, [5,20,60,120])`（僅 `period==='day'`）→ `aboveBar/arrowDown/該均線色/破X`，與 `computeKdMarkers` 買賣箭頭合併、`localeCompare(time)` 排序後一次 `setMarkers`。
  - `maStatus` useMemo（僅日線）→ 圖上方紅綠燈 chip（站上綠✓ / 跌破紅✗ / 資料不足灰），用 `MA_STATE_STYLE` record + `maStatusText` 避免巢狀三元。
  - 圖例加 MA120 色鍵；浮窗補半年線、向下箭頭=跌破、上方色塊=站上/跌破說明。
- `npm run type:check` 三 workspace 全綠。實機 UI 待使用者於 dev（admin port 3011）確認。
- `admin/src/lib/ma-signals.ts` — Write @ 2026-06-07 10:11
