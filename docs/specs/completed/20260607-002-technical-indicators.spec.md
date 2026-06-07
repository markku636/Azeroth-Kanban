# 趨勢動能技術指標 + 背離（A 類 + 背離偵測）

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: docs/plans/doing/20260607-001-advanced-scoring-and-strategy.md

---

## 目標

擴充技術指標庫，新增 DMI/ADX、威廉 %R、CCI、OBV、乖離率 BIAS、SAR 拋物線停損，以及 MACD/RSI/量價背離偵測；全整合進規則訊號、momentum 因子評分、警報與詳情頁顯示 + 名詞字典。另加 MA120/MA240（供 D 突破年線）。

## 背景

`computeIndicators` 目前只算 MA/EMA/RSI/MACD/KD/Bollinger/量能比。市售軟體標配的趨向、超買超賣、量能潮、乖離、停損點、背離都缺。`technicalindicators@3.1.0` 已內建 ADX/WilliamsR/CCI/OBV/PSAR。

> 參考知識：docs/plans/doing/20260607-001-advanced-scoring-and-strategy.md（WP-A）

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 指標存入既有 `indicators Json?`，無 migration |
| `common` | ✅ | `StockIndicators` 擴充 |
| `worker` | ✅ | indicators/signals/momentum scorer/alerts + 測試 |
| `admin` | ✅ | glossary/verdict + 詳情頁技術 tab 顯示 |

## 建議開發順序

1. `common` — `stock-types.ts` 擴 `StockIndicators` → build
2. `worker` — `indicators.ts` → `signals.ts` → `scorers/momentum.ts` → `alerts.ts` → 測試
3. `admin` — glossary/verdict → 詳情頁技術 tab

---

## 受影響檔案

### common

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `common/src/stock-types.ts` | 修改 | `StockIndicators` 加 `dmi`/`williamsR`/`cci`/`obv`/`bias`/`sar`/`divergence`/`ma120`/`ma240` |

### worker

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/ta/indicators.ts` | 修改 | 計算 ADX/%R/CCI/OBV/PSAR/BIAS/MA120/MA240；新增 `padLeft`、`detectDivergence`、`obvSeries`/`sarSeries`/`adxSeries` |
| `worker/src/ta/signals.ts` | 修改 | 新增 ADX/%R/CCI/SAR/BIAS/背離 規則（±權重制）；`describeTrend` 擴充 |
| `worker/src/ta/scorers/momentum.ts` | 修改 | 由 stub 改為真實彙整（ADX 趨勢 + 背離 + %R/CCI/BIAS 位階）→ 0–100 |
| `worker/src/alerts.ts` | 修改 | 新增 `ADX_TREND_START`/`BIAS_EXTREME_HIGH`/`BIAS_EXTREME_LOW`/`DIVERGENCE_BULLISH`/`DIVERGENCE_BEARISH` |
| `worker/src/ta/ta.test.ts` | 修改 | 各指標非空 + `detectDivergence` 正反例 + 向後相容 |
| `worker/src/alerts.test.ts` | 修改 | 5 新 alert type 案例 |

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/config/financial-glossary.ts` | 修改 | 新增 `DMI_ADX`/`WILLIAMS_R`/`CCI`/`OBV`/`SAR`/`DIVERGENCE`/`VOLUME_PRICE_DIVERGENCE`/`MA240`；`BIAS` 補資料；更新 `GLOSSARY_GROUPS` |
| `admin/src/lib/beginner-verdict.ts` | 修改 | `adxVerdict`/`williamsVerdict`/`biasVerdict` |
| `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` | 修改 | 技術 tab 新增「趨勢動能」stat grid；擴 `TAB_GUIDE_KEYS.tech` |

---

## 邏輯變更點

### worker
- `computeIndicators`：ADX 回傳 `pdi`/`mdi`（非 plusDI/minusDI）；OBV 長度 = 輸入 −1，序列左補 null 對齊（沿用 `maSeries` 模式）。BIAS(n)=`(close−MAn)/MAn*100`。
- `detectDivergence(price, osc, lookback=40, lr=3)`：找近端 swing 高低 pivot，價創新高但 osc 較低 → bearish；價創新低但 osc 較高 → bullish。對 MACD histogram / RSI / OBV 各跑一次。
- 訊號權重：ADX>25 趨勢確立 ±1.2、%R<−80/>−20 ±1.2、CCI 突破±100 ±1、SAR 翻多/空 ±1.2、BIAS 過大 ±1、MACD/RSI 背離 ±1.5、量價背離 ±1。

## 預期測試結果

- [ ] 80 根合成 K：`dmi.adx`/`williamsR`/`cci`/`obv.value`/`bias.bias20`/`sar.value` 非空
- [ ] `detectDivergence` 人工構造正反例正確
- [ ] `generateSignal` 省略第 3 參數仍回有效結構（向後相容）
- [ ] `npm run type:check`（common/worker/admin）通過

## 風險評估

- ADX 暖機需 ~28 根；analysis 載 120 根足夠，短序列須 guard 回 null/all-false。
- lint 壞，僅靠 type:check + vitest。

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認
補齊市售軟體標配技術指標 + 背離，feed momentum 因子與訊號/警報。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 用 `technicalindicators` 內建 ADX/%R/CCI/OBV/PSAR | ✅ 採納 | 零新依賴，已驗證 3.1.0 有匯出 |
| 背離自實作 swing-pivot | ✅ 採納 | 庫無背離；pivot 法可控可測 |

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

- `admin/src/config/financial-glossary.ts` — Edit @ 2026-06-06 16:19
- `admin/src/lib/beginner-verdict.ts` — Edit @ 2026-06-06 16:20
