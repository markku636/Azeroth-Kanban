# 策略選股模板（D 類）

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: docs/plans/doing/20260607-001-advanced-scoring-and-strategy.md

---

## 目標

把選股器的 `if (strategy===...)` 串重構為宣告式 registry，並新增 6 個策略模板：法人連買、月營收創新高/連續成長、突破年線、高殖利率存股、均線多頭+量增、GARP 成長價值。選股頁依所選策略動態渲染欄位並依 read-time total 重排。

## 背景

現有選股器只有 all/momentum/value/chips 4 策略，內嵌於 `stock-service.ts`。新增多策略需要可擴展的 registry。本 Spec 純 read-time 組裝既有資料（A/B/C 已落庫），不碰 worker、不碰 DB，最低風險，最後做。

> 參考知識：docs/plans/doing/20260607-001-advanced-scoring-and-strategy.md（WP-D）

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 讀現成欄位，無 migration |
| `common` | ❌ | 型別放 admin 端 |
| `admin` | ✅ | 新增 `screen-strategies.ts`；`stock-service.ts`/route/選股頁 |

## 建議開發順序

1. `admin` — `screen-strategies.ts`（registry + 6 策略）
2. `admin` — `stock-service.ts` `getScreener` 改用 registry
3. `admin` — `screener/page.tsx` 動態欄位 + 策略下拉

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/screen-strategies.ts` | 新增 | `ScreenStrategy`/`ScreenColumn`/`ScreenRow` registry + 既有 4 + 新 6 策略 |
| `admin/src/lib/stock-service.ts` | 修改 | `getScreener` 建 row（補 institutionalStreak/ma240/peg/valuationZone）→ 查 registry → filter+sort |
| `admin/src/app/api/v1/stock/screener/route.ts` | 修改 | 沿用 `strategy` param（值改 registry key） |
| `admin/src/app/(dashboard)/stock-bot/screener/page.tsx` | 修改 | 策略下拉由 registry 驅動；動態欄位（表頭 TermLabel + 紅綠燈 PlainVerdict）；擴 BeginnerGuide keys |
| `admin/src/config/financial-glossary.ts` | 修改 | 新增 `PEG`/`REVENUE_HIGH`（MA240/INST_STREAK/VALUATION_ZONE 由 002/003/004 提供） |

---

## 邏輯變更點

### admin
- registry：`ScreenStrategy { key, label, description, predicate(row), columns[], sort? }`；既有 all/momentum/value/chips 遷入維持行為。
- 6 新策略 predicate：
  1. 法人連買 `institutionalStreak >= 3`
  2. 月營收創新高/連續成長 `revenueYoyHigh || revenueConsecMom >= 3`
  3. 突破年線 `close > ma240`（無 240 退 ma120）
  4. 高殖利率存股 `dividendYield >= 4 && eps > 0`
  5. 均線多頭+量增 `maBullish && volumeRatio >= 1.5`
  6. GARP `peg = per/revenueYoy`，`0 < peg < 1 && revenueYoy > 0`
- `peg` read-time 計算；`ma120/ma240` 讀 `indicators` JSON；`institutionalStreak`/`valuationZone` 讀 `analysis_signal` 新欄位。

## API 合約

| 端點 | 方法 | 請求 | 回應 |
| --- | --- | --- | --- |
| `/api/v1/stock/screener` | GET | `?strategy=<registry key>` | rows 依策略 filter + total 重排，含動態欄位 |

## 回滾計劃

1. 還原 `getScreener` 內嵌 if 串；移除 `screen-strategies.ts`。
2. 選股頁策略下拉還原為 4 個固定值。

## 預期測試結果

- [ ] 6 新策略各能正確過濾（手動以已分析的 pool 驗證）
- [ ] 切策略欄位/排序正確；表頭浮窗、紅綠燈正常
- [ ] 既有 4 策略行為不變
- [ ] `npm run type:check`（admin）通過

## 風險評估

- 依賴 A/B/C 已落庫欄位；若某檔尚未回填新欄位，predicate 須容忍 null（回 false 不崩）。

---

## AI 協作紀錄（本次 Spec 範圍）

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 宣告式 registry 取代 if 串 | ✅ 採納 | 新增多策略可擴展，欄位/紅綠燈隨策略宣告 |

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

- `admin/src/lib/screen-strategies.ts` — Write @ 2026-06-06 16:41
