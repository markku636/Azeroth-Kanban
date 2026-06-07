# 股票機器人 — 回測頁圖表強化（買賣點）＋ 白話解說

> 建立日期: 2026-06-07
> 狀態: 🔵 開發中
> 關聯計劃書: docs/plans/doing/20260607-002-kd-backtest.md

---

## 目標

回測頁（`/stock-bot/backtest`）的「資產變化」圖太單薄、看不懂。本次：
1. **圖表加買/賣點**（▲買 ▼賣 箭頭）並強化為「完整版」（面積填色 / 圖例浮窗 / 十字游標 / 資料來源）—— 參考 Console K 線圖。
2. **加白話解說**：常駐「策略說明卡」（回答「買進策略是什麼」）、紅綠燈「結果結論卡」、名詞 ⓘ 浮窗補齊。

## 背景

trades / params 已在 `BacktestResultData`（`data.trades` / `data.params`），純前端呈現強化，**無 API / DB / worker 異動**。

> 參考實作：`admin/src/app/(dashboard)/stock-bot/console/KlineChart.tsx`（setMarkers 買賣箭頭 + 圖例？浮窗）、
> `admin/src/app/(dashboard)/stock-bot/console/StockVerdictCard.tsx`（紅綠燈看圖小幫手卡）、
> `admin/src/lib/beginner-verdict.ts`（`{ text, tone }` 慣例）、`admin/src/config/financial-glossary.ts`（名詞字典）。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 |
| `common` | ❌ | 無（沿用既有 `BacktestParams` / `BacktestTrade`） |
| `admin` | ✅ | 圖表元件 + 兩張白話卡 + 純函式 helper + 名詞字典 |
| `worker` | ❌ | 無 |

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/config/financial-glossary.ts` | 修改 | 新增 `VOLATILITY`（年化波動度）名詞 + 型別聯集 |
| `admin/src/lib/backtest-verdict.ts` | 新增 | 純函式 `buildBacktestVerdict(input)` → `{ level, headline, lights[], action }` |
| `admin/src/app/(dashboard)/stock-bot/backtest/StrategyExplainerCard.tsx` | 新增 | 常駐策略說明卡（白話買/賣條件） |
| `admin/src/app/(dashboard)/stock-bot/backtest/BacktestVerdictCard.tsx` | 新增 | 紅綠燈結果結論卡（仿 StockVerdictCard） |
| `admin/src/app/(dashboard)/stock-bot/backtest/EquityCurveChart.tsx` | 修改 | 新 props `trades`/`params`；買賣 markers / 面積填色 / 十字游標 / 圖例＋？浮窗 / 資料來源 footer |
| `admin/src/app/(dashboard)/stock-bot/backtest/BacktestResultView.tsx` | 修改 | 頂部插結論卡；圖傳 trades/params；風險卡補 `TermLabel` |
| `admin/src/app/(dashboard)/stock-bot/backtest/page.tsx` | 修改 | 常駐渲染策略說明卡；BeginnerGuide keys 補 `KD_CROSS`/`PROFIT_FACTOR`/`SHARPE` |

---

## 邏輯變更點

### EquityCurveChart（完整版）
- 策略改 `addAreaSeries`（線 `#2563eb` + 漸層填色），買進持有保留 line（灰 `#9ca3af` 虛線 `LineStyle.Dashed`）。
- 由 `trades` 生 `SeriesMarker<Time>[]`：進場 belowBar 綠 ▲「買」、出場 aboveBar 紅 ▼「賣」；依 time 升冪 sort 後 `setMarkers`。
- `crosshair.mode = Normal`；新增圖例列 + ？圖例說明浮窗（純 CSS）+「資料來源：FinMind」footer。

### backtest-verdict.ts（純函式）
- 輸入：`{ totalReturnPct, buyHoldPct, winRate, maxDrawdownPct, totalTrades }`（皆可為 null，空值回中性）。
- lights（號誌語意 good=綠/neutral=黃/bad=紅）：①賺賠 ②贏過大盤? ③勝率(≥60/40-60/<40) ④最大回撤(≤10/10-20/>20)。
- headline / action / level（good=綠 / mixed=黃 / bad=紅 / none=不渲染）依賺賠 × 是否贏大盤組合。

### StrategyExplainerCard
- props `{ params?: BacktestParams | null }`，白話講 K<buyBelow 黃金交叉買、K>sellAbove 死亡交叉賣（隔日開盤成交、複利、可停損停利）。

### BacktestResultView / page
- 結論卡渲染在既有數字卡上方（白話先行）；`EquityCurveChart` 傳 `trades`/`params`；年化波動度套 `TermLabel termKey="VOLATILITY"`。
- page 常駐渲染 `StrategyExplainerCard`，BeginnerGuide keys 併入新名詞。

## 顏色慣例（重要）
- 結論卡**燈點**＝號誌語意（綠=好、黃=普通、紅=要注意），對齊 `StockVerdictCard`。
- 既有**金額數字**維持台股慣例（紅=賺、綠=賠，`gainCls`）。兩套並存為 app 既有設計，不更動。

## 資料表異動

無（本次無任何 DB schema 變更）。

## 預期測試結果

- [ ] `npm run type:check`（admin）通過；Prettier/ESLint 自審通過
- [ ] 2330 近 5 年：資產變化圖出現 ▲買/▼賣（數＝交易筆數×2、日期對齊交易明細）+ 面積/虛線/十字游標/？浮窗/footer
- [ ] 策略說明卡常駐且白話正確；結果結論卡（2330 應「有賺但跑輸大盤」/黃）顯示於數字卡上方
- [ ] 年化波動度 ⓘ 浮窗可開；BeginnerGuide 名詞補齊
- [ ] chrome-devtools 截圖比對 Console 圖完整度

## 風險評估
- 買賣 markers 必須依 time 升冪排序，否則 lightweight-charts 報錯/不顯示。
- trades 日期可能含時間字串 → 一律 `slice(0,10)` 對齊日 K。
- 無 trades（0 交易）→ 不畫 markers、結論卡 level=none 不渲染（沿用既有黃色提示）。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## 產出摘要

- **圖表（核心）**：`EquityCurveChart` 加買/賣箭頭（由 trades 生 `SeriesMarker`，升冪排序後掛策略線）、
  策略改藍色面積 + 買進持有灰色虛線、十字游標、圖例列 + ？浮窗、FinMind footer。
- **白話三件**：常駐 `StrategyExplainerCard`（K&lt;buyBelow 黃金交叉買、K&gt;sellAbove 死亡交叉賣）、
  紅綠燈 `BacktestVerdictCard`（仿 StockVerdictCard，插在數字卡上方）、名詞 ⓘ 補齊（新增 `VOLATILITY` +
  BeginnerGuide 併入 `KD_CROSS`/`PROFIT_FACTOR`/`SHARPE`）。
- **純函式** `buildBacktestVerdict`（`admin/src/lib/backtest-verdict.ts`）：4 盞燈 + headline + action + level。
- **驗證**：三 workspace `npm run type:check` 全綠；以 tsx 跑真實數字 4 案，2330（+12.2% vs 買進持有 +129.4%）
  正確判為 `mixed`「有賺，但跑輸大盤」、賺贏大盤→`good`、賠錢→`bad`、0 交易→`none`(不渲染)。
- **待使用者視覺確認**：登入後於 `localhost:3011/stock-bot/backtest` 開既有 2330 回測，檢視箭頭/卡片/浮窗。
  （docker 3020 為舊 build，需看 dev 3011 或重建 docker。）

## Bug Log

<!-- 開發遇到的問題 -->
- `admin/src/config/financial-glossary.ts` — Edit @ 2026-06-07 07:50
- `admin/src/lib/backtest-verdict.ts` — Write @ 2026-06-07 07:52
- `admin/src/app/(dashboard)/stock-bot/backtest/StrategyExplainerCard.tsx` — Write @ 2026-06-07 07:53
- `admin/src/app/(dashboard)/stock-bot/backtest/BacktestVerdictCard.tsx` — Write @ 2026-06-07 07:54
- `admin/src/app/(dashboard)/stock-bot/backtest/EquityCurveChart.tsx` — Write @ 2026-06-07 07:56
- `admin/src/app/(dashboard)/stock-bot/backtest/BacktestResultView.tsx` — Edit @ 2026-06-07 07:56
- `admin/src/app/(dashboard)/stock-bot/backtest/page.tsx` — Edit @ 2026-06-07 07:57
- `admin/src/app/(dashboard)/stock-bot/backtest/BacktestVerdictCard.tsx` — Edit @ 2026-06-07 08:01
- `admin/src/app/(dashboard)/stock-bot/backtest/page.tsx` — Write @ 2026-06-07 08:51
- `admin/src/app/(dashboard)/stock-bot/console/KlineChart.tsx` — Edit @ 2026-06-07 10:12
