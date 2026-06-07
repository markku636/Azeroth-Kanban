# 股票機器人 — K 線圖買/賣箭頭標記（小白友善）

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: 無（延續 20260606-014/015「讓小白看懂 K 線」）

---

## 目標

讓 K 線圖本身也有白話提示：在圖上用 **▲買 / ▼賣** 箭頭標記出系統偵測到的買賣時機點，與「看圖小幫手」結論卡同一套 9 日 KD 邏輯。小白不用會看 KD，也能在圖上直接看到「這裡曾出現買點 / 賣點」。

## 背景

延續 14（紅綠燈結論卡）與 15（圖例說明浮窗）。標記用 lightweight-charts v4 的 `series.setMarkers()`，純前端、無資料/後端變更。

- **買**：KD 低檔黃金交叉（K 由下穿越 D，且 K < 40）。
- **賣**：KD 高檔死亡交叉（K 由上跌破 D，且 K > 60）。
- 與 `worker/src/ta/signals.ts` 的 KD 交叉門檻一致（40 / 60）。
- 標記顏色採**號誌語意**：綠 ▲買、紅 ▼賣（與結論卡一致；圖例浮窗會註明「蠟燭紅綠看漲跌、箭頭綠買紅賣」）。
- 標記依目前顯示週期（日/週/月）即時重算，marker 時間對齊該週期 K 棒。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | **無 DB 變更** |
| `common` | ❌ | 無 |
| `admin` | ✅ | KD 標記計算（純函式）+ KlineChart 畫標記 + 圖例補充 |

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/kd-verdict.ts` | 修改 | 新增 `computeKdMarkers(bars)` 與 `KdMarker` 型別（複用既有 stochastic / 常數） |
| `admin/src/app/(dashboard)/stock-bot/console/KlineChart.tsx` | 修改 | 蠟燭 series `setMarkers()` 畫 ▲買/▼賣；圖例補 ▲買▼賣 與說明 |

---

## 邏輯變更點

### admin
- `kd-verdict.ts`：
  - 新增常數 `KD_GOLDEN_CROSS_MAX=40`、`KD_DEAD_CROSS_MIN=60`。
  - `computeKdMarkers(bars): KdMarker[]`：用既有 `stochastic` 算 K/D 序列，逐點偵測黃金/死亡交叉並套低/高檔門檻，回 `{ date, kind: 'buy'|'sell' }[]`（date 對齊原始 bar）。offset = `KD_PERIOD + KD_SIGNAL - 2`。
- `KlineChart.tsx`：
  - `import type { SeriesMarker, Time }`；對 `agg` 呼叫 `computeKdMarkers`，map 成 `SeriesMarker<Time>[]`（買=belowBar/arrowUp/綠、賣=aboveBar/arrowDown/紅、text 買/賣），`candles.setMarkers(...)`。
  - 圖例列加「▲買 ▼賣」鍵；浮窗補一行說明箭頭含義，並把 💡 提醒改為「蠟燭紅綠看漲跌；箭頭綠買紅賣（與卡片燈號一致）」。

## 回滾計劃

1. 還原 KlineChart 的 setMarkers 與圖例補充；移除 kd-verdict 的 `computeKdMarkers`/常數。無 DB / 依賴變更。

## 預期測試結果

- [x] `npm run type:check` 通過（admin / worker / common 全綠）
- [x] 實機（2330 console）：圖上出現散布的綠 ▲買 / 紅 ▼賣 箭頭（高點賣、低點買），數量合理；圖例與浮窗顯示 ▲買▼賣 說明；共用 KlineChart 故詳情頁同步生效

## 風險評估

- 標記過多造成雜亂 → 僅低檔黃金/高檔死亡交叉才畫，頻率低。
- marker 時間須等於某根 K 棒時間 → 以 `agg` 的 bar date 產生，必對齊。
- lightweight-charts v4 `setMarkers` 為 series 方法（v5 改 API），本專案為 v4.2.3，相容。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認
在 K 線圖畫 ▲買/▼賣 箭頭，與結論卡同套 9 日 KD（低檔黃金交叉買、高檔死亡交叉賣），讓圖本身也有白話提示。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 標記用 KD 低檔黃金/高檔死亡交叉 | ✅ 採納 | 與卡片/worker signals 同套，小白易懂 |
| 標記顏色綠買紅賣（號誌語意） | ✅ 採納 | 與結論卡一致；浮窗註明與蠟燭漲跌色不同 |
| 依顯示週期即時重算（非固定日線） | ✅ 採納 | marker 必對齊該週期 K 棒，避免時間不符 |

### 產出摘要
- `kd-verdict.ts`：新增 `KdMarker` 型別 + `computeKdMarkers(bars)`（複用既有 9 日 stochastic；常數 `KD_GOLDEN_CROSS_MAX=40` / `KD_DEAD_CROSS_MIN=60`；offset = `KD_PERIOD+KD_SIGNAL-2`）。
- `KlineChart.tsx`：`computeKdMarkers(agg)` → `SeriesMarker<Time>[]`（買=belowBar/arrowUp/綠、賣=aboveBar/arrowDown/紅、text 買/賣）→ `candles.setMarkers()`；圖例加 ▲買▼賣 鍵 + 浮窗一行說明，💡 改為「蠟燭紅綠看漲跌；箭頭綠買紅賣（與卡片一致）」。
- 依顯示週期即時重算（agg），marker 時間對齊 K 棒。實機 2330 確認箭頭顯示、type:check 全綠。
- `admin/src/lib/kd-verdict.ts` — Edit @ 2026-06-06 10:54
