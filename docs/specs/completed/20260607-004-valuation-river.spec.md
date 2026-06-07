# 估值河流圖（C 類）

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: docs/plans/doing/20260607-001-advanced-scoring-and-strategy.md

---

## 目標

逐日落庫 PER/PBR/殖利率歷史，畫本益比河 / 股價淨值比河 / 殖利率河流帶，計算估值位階（便宜/合理/昂貴），併入 valuation 因子評分與警報；於詳情頁基本面 tab 顯示互動圖 + 名詞字典。

## 背景

現有 `StockFundamental` 只存最新一筆估值，畫不出河流；`TaiwanStockPER` 本就回傳逐日 PER/PBR/殖利率序列，可一次抓多年落庫重用。河流圖是財報狙擊手招牌功能。

> 參考知識：docs/plans/doing/20260607-001-advanced-scoring-and-strategy.md（WP-C）

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ✅ | 新增 `stock_valuation_daily`；`analysis_signal` 加 `valuation_zone`；`AlertType` 加 `VALUATION_CHEAP`/`VALUATION_EXPENSIVE` |
| `common` | ✅ | 新增 `valuation-bands.ts`（純函式）+ DTO |
| `worker` | ✅ | `data/valuation.ts` + `fundamentals.ts` 共用呼叫；`scorers/valuation.ts` 實作；`analysis.ts`/`alerts.ts` |
| `admin` | ✅ | `getValuation` + route + 河流圖元件 + 基本面 tab |

## 建議開發順序

1. `prisma` — schema + migrate + generate
2. `common` — `valuation-bands.ts` → build
3. `worker` — `data/valuation.ts` → `scorers/valuation.ts` → `analysis.ts`/`alerts.ts`
4. `admin` — `getValuation` → route → `ValuationRiverChart.tsx` → 基本面 tab

---

## 受影響檔案

### prisma

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `prisma/schema.prisma` | 修改 | 新增 `StockValuationDaily`；`analysis_signal` 加 `valuationZone String?`；`AlertType` 加 `VALUATION_CHEAP`/`VALUATION_EXPENSIVE` |

### common

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `common/src/valuation-bands.ts` | 新增 | `computeRiverBands(points, metric, multiples?)`、`valuationZone(ratioSeries, metric)` + 型別 |
| `common/src/stock-types.ts` | 修改 | `ValuationDailyPoint`/`RiverBands`/`ValuationZone` 等 DTO（或由 valuation-bands 匯出） |
| `common/src/index.ts` | 修改 | barrel 匯出 `valuation-bands` |

### worker

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/data/valuation.ts` | 新增 | `loadValuationHistory(symbol)`：3 年 `TaiwanStockPER` 逐日 upsert |
| `worker/src/data/fundamentals.ts` | 修改 | `TaiwanStockPER` lookback 拓寬至 3 年並與 valuation 共用回應 |
| `worker/src/ta/scorers/valuation.ts` | 修改 | 由 stub 改實作：便宜 +、昂貴 − → 0–100 |
| `worker/src/jobs/analysis.ts` | 修改 | 呼叫 `loadValuationHistory`；算 zone 落 `analysis_signal`；傳入 score/alert ctx |
| `worker/src/alerts.ts` | 修改 | `VALUATION_CHEAP`/`VALUATION_EXPENSIVE` 觸發 + label + ctx |

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-service.ts` | 修改 | 新增 `getValuation(symbol, metric)`（ApiResult） |
| `admin/src/app/api/v1/stock/valuation/route.ts` | 新增 | GET `?symbol=&metric=`（withPermission STOCK_SIGNAL_VIEW） |
| `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/ValuationRiverChart.tsx` | 新增 | client lightweight-charts 河流圖 + metric 切換 + 位階 badge |
| `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` | 修改 | 基本面 tab 嵌河流圖；擴 `TAB_GUIDE_KEYS.fundamental` |
| `admin/src/config/financial-glossary.ts` | 修改 | 新增 `PER_RIVER`/`PBR_RIVER`/`YIELD_RIVER`/`VALUATION_ZONE` |
| `admin/src/config/data-sources.ts` | 修改 | 加 `TaiwanStockPER (3y)` 來源列 |
| `admin/src/lib/beginner-verdict.ts` | 修改 | `valuationVerdict` |

---

## 邏輯變更點

> **實作調整（重要）**：`TaiwanStockPER` 只回傳逐日 PER/PBR/殖利率，**沒有收盤價**，故改用「**比率本身的歷史百分位水平 band**」而非「價格等值 EPS 帶」。河流圖畫「比率序列 + 5 條百分位水平線」，免逐日收盤、實作更穩健。

### common（`valuation-bands.ts`）
- `computeRiverBands(points, metric)`：取該指標序列（PER/PBR/殖利率，≤0 排除），算 5 條百分位水平 band（20/35/50/65/80%）+ 回傳序列、current。
- `valuationZone(series, metric)`：今日值在歷史有效值的百分位 → PER/PBR ≤20% 便宜 / 20–70% 合理 / ≥70% 昂貴；殖利率反向（高殖利率=便宜）；有效樣本 **<60** → unknown。

### worker
- `fetchPerHistory(symbol, 36)` 抓 36 個月（≈729 筆）PER 序列；`loadFundamentals` 與 `loadValuationHistory` **共用同一回應**（呼叫數與原本相同，僅放寬日期範圍，0 額外呼叫）。`loadValuationHistory` 逐日 upsert `StockValuationDaily`。

## 資料表異動

| 資料表 | 欄位 | 異動類型 | 詳細說明 |
| --- | --- | --- | --- |
| `stock_valuation_daily` | （整表） | 新增資料表 | close/per/pbr/dividend_yield Float?；`@@unique([symbol, trade_date])` + index |
| `analysis_signal` | `valuation_zone` | 新增欄位 | String? cheap/fair/expensive/unknown |
| `AlertType` | `VALUATION_CHEAP`/`VALUATION_EXPENSIVE` | 新增 enum 值 | 需獨立 migration |

Migration 注意事項：
- [x] down migration（DROP TABLE + drop column）
- [x] enum 加值獨立 migration
- [x] migrate 後 `prisma generate`

## API 合約

| 端點 | 方法 | 請求 | 回應 |
| --- | --- | --- | --- |
| `/api/v1/stock/valuation` | GET | `?symbol=&metric=PER\|PBR\|YIELD` | `ApiResult<{ bands, zone, asOf }>` |

## 回滾計劃

1. down migration：drop `stock_valuation_daily`、drop `valuation_zone`、移除 enum 值。
2. 還原 worker/admin；valuation scorer 退回 stub 50。

## 預期測試結果

- [x] `computeRiverBands` 產生 5 條百分位 band；per≤0 列被排除
- [x] `valuationZone` 百分位分類正確；<60 樣本回 unknown
- [x] ETF / 虧損股無 PER → 回 unknown 不崩
- [x] 詳情頁基本面 tab 河流圖可切 PER/PBR/殖利率（2330/2317/2454 線上驗證 zone=expensive）

## 風險評估

- FinMind 限流：共用 `TaiwanStockPER` 呼叫避免額外；全量回填僅空表時跑。
- ETF/虧損股無 PER/EPS → null 容忍。

---

## AI 協作紀錄（本次 Spec 範圍）

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 逐日落庫（非 on-demand） | ✅ 採納 | 多年序列重抓爆限流，現表只存最新一筆 |
| 河流圖用 lightweight-charts | ✅ 採納 | 與既有 KlineChart 同棧，零新依賴 |

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

- `common/src/valuation-bands.ts` — Write @ 2026-06-06 16:34
- `worker/src/data/fundamentals.ts` — Edit @ 2026-06-06 16:34
- `worker/src/data/valuation.ts` — Write @ 2026-06-06 16:35
- `admin/src/app/api/v1/stock/valuation/route.ts` — Write @ 2026-06-06 16:37
- `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/ValuationRiverChart.tsx` — Write @ 2026-06-06 16:38
- `admin/src/config/data-sources.ts` — Edit @ 2026-06-06 16:39
