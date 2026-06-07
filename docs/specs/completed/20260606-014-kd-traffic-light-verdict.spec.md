# 股票機器人 — K 線傻瓜紅綠燈結論卡（多週期 KD）

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: 無（k-fizzy-toast.md，UI 體驗強化，無對應正式 Plan）

---

## 目標

讓「不會看 K 線的小白」一秒看懂該不該買。抄三竹股市軟體的「多週期 KD 黃線方向法」，翻譯成 K 線圖上方的一張**紅綠燈結論卡**：兩盞燈（🧭 大方向 + 🎯 切入點）+ 一句白話 + 一個行動建議 + 免責。

## 背景

三竹原法：**月線 KD 黃線（D 慢線）向上且未到 80** → 大方向偏多可買；**60 分鐘 KD 黃線向上** → 安全切入點。
本專案只有日線資料（FinMind `TaiwanStockPrice`），無 60 分鐘盤中資料，且週/月線聚合已在前端 `KlineChart.tsx` 完成。故：
- 大方向用**月 KD**（月 K 不足時退**週 KD**）。
- 切入點用**日 KD**替代 60 分鐘（節奏慢一階，邏輯相同；使用者已確認接受）。
- 燈號採**號誌語意**（🟢=可買、🔴=別買，🟡=過熱別追），卡角標小字消除與台股漲紅跌綠的歧義。
- 只掛在 console 與個股詳情頁的 K 線圖上方。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | **無 DB 變更** |
| `common` | ✅ | 新增紅綠燈結論型別 |
| `admin` | ✅ | 新增聚合共用模組 + KD 結論純函式 + 結論卡元件 + 兩處掛載 |

## 建議開發順序

1. `common` — 新增 `KdVerdict` 等型別
2. `admin` — 抽出聚合模組 → KD 結論計算 → 結論卡元件 → 兩頁掛載

---

## 受影響檔案

### common

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `common/src/stock-types.ts` | 修改 | 新增 `KdLightColor` / `KdDirectionLight` / `KdEntryLight` / `KdVerdict` 型別 |

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/kline-aggregate.ts` | 新增 | 從 KlineChart 抽出 `aggregate()` / `bucketKey()` / `Bar` 共用 |
| `admin/src/lib/kd-verdict.ts` | 新增 | 內聯極簡 `stochastic()` + `computeKdVerdict()`（套真值表 + 降級） |
| `admin/src/app/(dashboard)/stock-bot/console/StockVerdictCard.tsx` | 新增 | 紅綠燈結論卡 client 元件 |
| `admin/src/app/(dashboard)/stock-bot/console/KlineChart.tsx` | 修改 | 改 import 共用聚合模組，移除私有複本 |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 修改 | K 線上方掛 `<StockVerdictCard>` |
| `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` | 修改 | 技術分頁 K 線上方掛 `<StockVerdictCard>` |

---

## 邏輯變更點

### common
- 新增型別：
  - `KdLightColor = 'green' | 'red' | 'yellow'`
  - `KdDirectionLight { color; basis: 'month'|'week'; dValue; dRising; zone: 'high'|'low'|'mid'; label }`
  - `KdEntryLight { color: 'green'|'red'|'gray'; dValue; dRising; label }`
  - `KdVerdict { direction; entryTiming; level; headline; action; confidenceNote; disclaimer; degraded }`

### admin
- `kline-aggregate.ts`：`bucketKey(date, period)`、`aggregate(points, period)`、`type Bar`，行為與原 KlineChart 私有版本完全一致。
- `kd-verdict.ts`：
  - `stochastic(bars, period=9, signal=3)` → 回 `{ k, d }[]` 完整序列（純 JS，零依賴）。
  - `dRising(series)` → 前一筆 D < 當前 D 為上升。
  - `computeKdVerdict(points)`：內部用 `aggregate` 算出日/週/月三套 Bar；大方向取月 KD（不足 `MIN_BARS` 退週），切入取日 KD，套真值表回 `KdVerdict`；資料不足時退灰燈白話降級。
  - 常數：`KD_PERIOD=9`、`KD_SIGNAL=3`、`KD_HIGH_ZONE=80`、`KD_LOW_ZONE=20`、`MIN_BARS=KD_PERIOD+KD_SIGNAL=12`。
  - **決策（偏離原計畫）**：KD 週期由 14 改為**台股經典 9 日**（三竹同款）。14 在 ~300 交易日（≈14 個月）下月 KD 幾乎永遠不足、會一直退週線，等同廢掉「月線大方向」；改 9 後 ~14 個月即可算出月 KD（已驗證），且更貼近三竹原版。
- `StockVerdictCard.tsx`：props=`KdVerdict`，白話 UI + 兩燈 + 行動 + 可展開 KD 數字 + 免責（`STOCK_DISCLAIMER`）。
- 兩頁：用既有 `kline`（完整日線 `KlinePoint[]`）`useMemo` 算出三套 Bar → `computeKdVerdict` → 傳給卡片，掛在 `<KlineChart>` 上方。

### 決策真值表（大方向 × 切入 → 一句話 / 行動）
| 大方向 | 切入 | headline | action |
| --- | --- | --- | --- |
| 🟢 | 🟢 | 方向對、時機也到了 | 可以考慮買進（分批、設停損） |
| 🟢 | 🔴 | 方向對，但先等短線轉強再進 | 先觀望，等切入燈轉綠再進 |
| 🟡 | 🟢 | 偏多但過熱，別追高 | 不追高，等拉回再找買點 |
| 🟡 | 🔴 | 過熱又轉弱，先別碰 | 等拉回、短線回穩再看 |
| 🔴 | 🟢/🔴 | 大方向往下 | 現在不要買 |

## 回滾計劃

1. 還原 `KlineChart.tsx` import；移除兩頁的 `<StockVerdictCard>` 掛載。
2. 刪除 `kline-aggregate.ts` / `kd-verdict.ts` / `StockVerdictCard.tsx` 與 common 新增型別。
3. 無 DB / migration，無需回滾資料。

## 預期測試結果

- [x] `npm run type:check` 通過（admin / worker / common 全綠）
- [x] tsx 煙霧測試（真實模組）：上升趨勢→月線基準+切入綠；下跌→大方向紅+level avoid；4 天→灰燈+unknown；168 天→退週線+標示「改用週線」。全數 PASS
- [ ] 〔待使用者本地確認〕2330：兩盞燈 + 一句話 + 行動齊全；切日/週/月不改變結論；可展開看 D 值/方向
- [ ] 〔待使用者本地確認〕console 與個股詳情頁皆顯示同一張卡，無 console error

## 風險評估

- 月 KD 在 ~14 個月日線邊界可能算不出 → 自動退週 KD，並標示「改用週線」。
- 抽出聚合模組後須確保 KlineChart 行為不變（同一函式，僅搬移）。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 Edit/Write 的檔案路徑 -->

## Bug Log

- 開發期注意（非程式 Bug）：專案 lint/format 工具在 next 15→16 升級後失效（`next lint` 已被 Next 16 移除；`admin/.eslintrc.json` 的 `extends: next` 是 flat-config，無法用 legacy eslintrc loader 執行；repo 亦無任何 prettier 設定檔，`prettier --check` 退回預設值導致全 repo 誤判）。本次以 `tsc --noEmit` 為主要把關，並人工遵循 coding-standards。此工具鏈修復屬另一獨立任務。

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

把三竹「月線大方向 + 60 分鐘切入點」的多週期 KD 操作法，簡化成一張小白一秒看懂的紅綠燈結論卡，掛在 K 線圖上方。

### 關鍵問答

#### 沒有 60 分鐘資料怎麼辦？
**AI 回應摘要**: 系統只有日線；用「日 KD 黃線方向」替代 60 分鐘切入點，邏輯相同、節奏慢一階，免接新資料源。使用者採納。

#### 燈號顏色語意？
**AI 回應摘要**: 台股漲紅跌綠與號誌綠走紅停相反，易使小白看反。採號誌語意（綠=可買、紅=別買），卡角標小字說明。使用者採納。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 切入點用日 KD 替代 60 分鐘 | ✅ 採納 | 無盤中資料；最簡、最穩 |
| 前端 client-side 算 KD（不動 schema/worker/API） | ✅ 採納 | 聚合與 OHLC 已在前端，footprint 最小 |
| 燈號採號誌語意（綠=可買） | ✅ 採納 | 對小白最直覺 |
| 接真 60 分鐘盤中資料 | ❌ 棄用 | 需新資料源、成本高、與「更簡單」相悖 |

### 產出摘要

<!-- AI 完成後自動更新 -->
- `admin/src/lib/kline-aggregate.ts` — Write @ 2026-06-06 08:41
- `admin/src/lib/kd-verdict.ts` — Write @ 2026-06-06 08:43
- `admin/src/app/(dashboard)/stock-bot/console/StockVerdictCard.tsx` — Write @ 2026-06-06 08:44
- `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` — Edit @ 2026-06-06 08:45

**設計重點**：
- 核心 `computeKdVerdict(points)` 為純函式，吃完整日線 → 內部聚合日/週/月 → 算 9 日 KD → 取 D 線方向 + 位階 → 真值表 → `KdVerdict`。零外部依賴、不動 schema/worker/API。
- 卡片 `StockVerdictCard` 以 `useMemo` 即時計算，掛在兩頁 K 線圖上方；號誌語意（綠=可買、紅=別買、黃=過熱、灰=資料不足），可展開看 D 值/方向，附 `STOCK_DISCLAIMER`。
- 大方向自動「月線→週線→灰燈」三段降級；切入點用日 KD 替代三竹 60 分鐘。
- KD 週期採台股經典 9 日（偏離原計畫的 14，理由見「邏輯變更點」）。
