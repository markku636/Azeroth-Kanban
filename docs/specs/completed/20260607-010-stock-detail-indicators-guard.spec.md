# 股票機器人 — 個股詳情頁趨勢動能指標缺值防護（修 crash）

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: 無（hotfix，驗證 Docker 部署時發現）

---

## 目標

修正個股詳情頁「技術」分頁的「趨勢動能」區塊：當 `indicators` 物件存在但子物件（`dmi` / `bias` / `obv` / `sar` / `divergence`）缺值時，`indicators.dmi.adx` 等存取會丟 `Cannot read properties of undefined`，導致**整頁 crash（This page couldn't load）**。改用 optional chaining（`?.`）防護。

## 背景

部署最新 Docker（admin）後驗證時，個股 2892 詳情頁 console 報 `Uncaught TypeError: Cannot read properties of undefined (reading 'adx')`。根因：2892 的分析資料由**舊 worker**產出（spec 002 趨勢動能指標尚未存在），故 `indicators` 有值但 `indicators.dmi` 為 `undefined`。詳情頁的趨勢動能區塊假設子物件恆存在，未防護 → 全頁 crash。影響：所有「尚未被新 worker 重新分析」的個股詳情頁都會掛。

> 型別 `StockIndicators` 將 `dmi` 等宣告為必填，故 `tsc` 無法捕捉此 runtime 缺值。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 |
| `common` | ❌ | 無 |
| `admin` | ✅ | 詳情頁趨勢動能區塊加 `?.` 防護 |

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` | 修改 | 趨勢動能區塊 `indicators.{dmi,bias,obv,sar,divergence}.*` 全部改 optional chaining `?.` |

---

## 邏輯變更點

- `indicators.dmi.adx/plusDi/minusDi` → `indicators.dmi?.…`（`adxVerdict` 已對 null/undefined 回 UNKNOWN）
- `indicators.bias.bias20` → `indicators.bias?.bias20`（`biasVerdict` 同上）
- `indicators.obv.trend` → `indicators.obv?.trend`
- `indicators.sar.value/position` → `indicators.sar?.…`
- `indicators.divergence.{macd,rsi,volume}{Bearish,Bullish}` → `indicators.divergence?.…`
- 缺值時顯示「—」/「資料不足」，不再 crash；資料齊全時行為不變。

## 回滾計劃

1. 回退該檔趨勢動能區塊至上一版本。

## 預期測試結果

- [x] 個股 2892（舊資料，indicators 無 dmi）詳情頁不再 crash、趨勢動能顯示「—/資料不足」
- [x] 有完整 indicators 的個股（2330）顯示正常：ADX 34.22 多方趨勢明確 / 威廉 -29.41 / CCI 93.33 / 乖離 3.28% / OBV 量能下降 / SAR 偏多 / 偵測到頂背離；數值與 DB 一致
- [x] `npm run type:check` 通過（admin + worker）
- [x] Docker admin 重建後 3020 詳情頁正常（console 0 error）

> 資料佐證：45 筆 analysis_signal 全有 indicators，但僅 4 筆含 dmi → 41/45（91%）個股原本會 crash，此修復全數解除。

## 風險評估

- 純防禦性 optional chaining，資料齊全時零行為變化；無資料流 / DB 風險。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

修 Docker 部署驗證時發現的詳情頁 crash（indicators 子物件缺值）。

### 產出摘要

- 詳情頁趨勢動能區塊 `indicators.{dmi,bias,obv,sar,divergence}.*` 全部加 optional chaining `?.`；`adxVerdict`/`biasVerdict` 本就對 null 回 UNKNOWN，缺值顯示「資料不足/—」。
- 重建 admin image + `docker compose up -d admin` 部署；2892（缺值，原 crash）→ 優雅降級、2330（完整）→ ADX 34.22 多方趨勢明確等正確顯示，皆無 console error。
- `npm run type:check` 全綠。變更檔：`admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx`。
- `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` — Edit @ 2026-06-07 00:57
