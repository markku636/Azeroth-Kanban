# 三大法人籌碼落庫 + 連買賣 streak（B 類）

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: docs/plans/doing/20260607-001-advanced-scoring-and-strategy.md

---

## 目標

把三大法人逐日買賣超落庫，計算「連續買賣超天數 streak」與「籌碼集中度」，併入 chips 因子評分與警報；於詳情頁籌碼 tab 顯示 + 名詞字典。

## 背景

`finmind.ts` 已有 `fetchInstitutionalTrades` 但從未被呼叫/落庫；目前籌碼只有融資券 + 外資持股比例。法人連買連賣是市售軟體（CMoney 籌碼K線）核心指標。

> 參考知識：docs/plans/doing/20260607-001-advanced-scoring-and-strategy.md（WP-B）

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ✅ | 新增 `stock_institutional` 表；`analysis_signal` 加 `institutional_streak`；`AlertType` 加 `INSTITUTIONAL_STREAK` |
| `common` | ✅ | 新增 `InstitutionalSummary` 型別 |
| `worker` | ✅ | 新增 `data/institutional.ts`；`chipSignals.ts` + `scorers/chips.ts` 增強；`analysis.ts`/`alerts.ts` |
| `admin` | ✅ | glossary/verdict + 詳情頁籌碼 tab |

## 建議開發順序

1. `prisma` — schema + migrate + generate
2. `common` — `InstitutionalSummary`
3. `worker` — `data/institutional.ts` → `chipSignals.ts` → `analysis.ts` → `alerts.ts`
4. `admin` — glossary/verdict → 籌碼 tab

---

## 受影響檔案

### prisma

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `prisma/schema.prisma` | 修改 | 新增 `StockInstitutional` model；`analysis_signal` 加 `institutionalStreak Int?`；`AlertType` 加 `INSTITUTIONAL_STREAK` |

### common

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `common/src/stock-types.ts` | 修改 | 新增 `InstitutionalSummary { netToday, net5, streakDays, concentration, bias, text }` |

### worker

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/data/institutional.ts` | 新增 | `loadInstitutional(symbol, days)`：用 `fetchInstitutionalTrades` upsert `StockInstitutional`（一日一列） |
| `worker/src/ta/chipSignals.ts` | 修改 | 新增 `computeInstitutionalSummary(trades, avgVol5)` → streak/集中度/bias |
| `worker/src/ta/scorers/chips.ts` | 修改 | 併入法人 streak bias |
| `worker/src/jobs/analysis.ts` | 修改 | 呼叫 `loadInstitutional`；streak 落 `analysis_signal`；傳入 score/alert ctx |
| `worker/src/alerts.ts` | 修改 | `INSTITUTIONAL_STREAK` 觸發條件 + label + ctx 欄位 |
| `worker/src/ta/ta.test.ts` | 修改 | `computeInstitutionalSummary` streak 測試 |

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/config/financial-glossary.ts` | 修改 | 新增 `INST_STREAK`/`CHIP_CONCENTRATION`；更新 `GLOSSARY_GROUPS` 籌碼面 |
| `admin/src/lib/beginner-verdict.ts` | 修改 | `institutionalStreakVerdict` |
| `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` | 修改 | 籌碼 tab 顯示法人連買/賣天數 + 集中度；擴 `TAB_GUIDE_KEYS.chips` |

---

## 邏輯變更點

### worker
- `loadInstitutional`：FinMind 3 法人 net 依日彙整成單列（foreign/trust/dealer/total）upsert。`.catch(()=>[])` 容錯。
- `computeInstitutionalSummary`：依日 totalNet 走 streak（連同號天數）；concentration = `net5*1000 / avgVol5 *100`（張轉股）；bias：streak≥3 →+1、≥5 →+2，反向對稱，集中度>20 加 +0.5，clamp −2..+2。

## 資料表異動

| 資料表 | 欄位 | 異動類型 | 詳細說明 |
| --- | --- | --- | --- |
| `stock_institutional` | （整表） | 新增資料表 | foreign_net/trust_net/dealer_net/total_net Int；`@@unique([symbol, trade_date])` + index |
| `analysis_signal` | `institutional_streak` | 新增欄位 | Int? 連續買賣超天數，供選股器 |
| `AlertType` | `INSTITUTIONAL_STREAK` | 新增 enum 值 | 需獨立 migration |

Migration 注意事項：
- [x] 需要 down migration（DROP TABLE + drop column）
- [x] enum 加值獨立 migration（不可與 DDL 同 txn）
- [x] migrate 後立即 `prisma generate`

## 回滾計劃

1. down migration：drop `stock_institutional`、drop `analysis_signal.institutional_streak`、移除 enum 值。
2. 還原 worker/admin 程式碼；chips scorer 退回不含 streak。

## 預期測試結果

- [ ] 4 連買合成 trades → `streakDays===4`、`bias>0`；連賣 → 負值；空陣列 → 安全 0
- [ ] `npm run type:check` 通過；`prisma studio` 見 `stock_institutional` 寫入

## 風險評估

- 張 vs 股單位：concentration 須確認 FinMind buy/sell 單位再定 ×1000；avgVol5 缺時 concentration 回 null。
- BigInt/Int：net 用 Int（張，量級安全）。

---

## AI 協作紀錄（本次 Spec 範圍）

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| `stock_institutional` 一日一列（4 欄位） | ✅ 採納 | streak/集中度查詢方便，符合既有逐日快取設計 |

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

- `worker/src/data/institutional.ts` — Write @ 2026-06-06 16:26
- `worker/src/ta/chipSignals.ts` — Edit @ 2026-06-06 16:27
- `worker/src/scripts/smoke-advanced.ts` — Write @ 2026-06-06 16:49
