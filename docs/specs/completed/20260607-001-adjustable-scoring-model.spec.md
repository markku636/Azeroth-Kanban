# 可調權重 / 多策略評分模型（評分骨架）

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: docs/plans/doing/20260607-001-advanced-scoring-and-strategy.md

---

## 目標

把固定權重三因子評分重構為「Worker 存原始因子（無 total/權重）→ admin read-time 依策略 preset 套權重」的可調權重多策略模型。因子由 3 升 5（chips/tech/fund/momentum/valuation），提供 5 個策略 preset。

## 背景

現行 `worker/src/ta/score.ts` 把權重寫死（籌碼 40/技術 35/基本 25）並直接算出 total，換策略要重跑全 pool。此 Spec 為後續 A/B/C/D 的共同地基，必須最先完成。

> 參考知識：docs/plans/doing/20260607-001-advanced-scoring-and-strategy.md（核心架構決策）

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | `score_detail` 為既有 `Json?` 欄位，結構改 v2 不需 migration |
| `common` | ✅ | 新增 `scoring-strategy.ts`；`stock-types.ts` 加 `ScoreFactorKey`/`ScoreDetail` |
| `worker` | ✅ | `score.ts` 拆 `scorers/*`，改回傳 `ScoreDetail`；`analysis.ts` 落 v2 |
| `admin` | ✅ | service read-time 加權；新 strategies 端點；詳情頁/選股頁策略下拉 |

## 建議開發順序

1. `common` — `scoring-strategy.ts` + `stock-types.ts` 型別契約 → build dist
2. `worker` — `score.ts` 拆 scorers（momentum/valuation 先 stub 回 50）+ `analysis.ts`
3. `admin` — `stock-service.ts` read-time 加權 + route + UI 下拉

---

## 受影響檔案

### common

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `common/src/scoring-strategy.ts` | 新增 | `ScoringStrategyId`、`SCORING_STRATEGIES`、`StrategyWeights`、`applyStrategy`、`normalizeWeights`、`FACTOR_KEYS`、`DEFAULT_STRATEGY` |
| `common/src/stock-types.ts` | 修改 | `ScoreFactorKey`、`ScoreFactor` 加 `key`、新增 `ScoreDetail`、`StockScore` 改 read-time 衍生 |
| `common/src/index.ts` | 修改 | barrel 匯出 `scoring-strategy` |

### worker

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/ta/score.ts` | 修改 | 改寫為 `computeScoreDetail(input): ScoreDetail`（無 total），組裝 5 因子 |
| `worker/src/ta/scorers/util.ts` | 新增 | 評分共用 `clamp` |
| `worker/src/ta/scorers/chips.ts` | 新增 | `scoreChips`（搬既有 chipScore） |
| `worker/src/ta/scorers/tech.ts` | 新增 | `scoreTech`（搬既有 techScore） |
| `worker/src/ta/scorers/fund.ts` | 新增 | `scoreFund`（營收 YoY/MoM + EPS，移除殖利率） |
| `worker/src/ta/scorers/momentum.ts` | 新增 | `scoreMomentum`（此 Spec 先 stub 回中性 50，由 002 補實作） |
| `worker/src/ta/scorers/valuation.ts` | 新增 | `scoreValuation`（此 Spec 先 stub 回中性 50，由 004 補實作） |
| `worker/src/jobs/analysis.ts` | 修改 | 存 `scoreDetail` v2；`score`(Int)=`applyStrategy(detail,'balanced').total` |

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-service.ts` | 修改 | `getScreener`/`getFundamental` read-time `applyStrategy` 重排；移除 `name==='籌碼面'` 改 `f.key==='chips'` |
| `admin/src/app/api/v1/stock/strategies/route.ts` | 新增 | GET 列 `SCORING_STRATEGIES` 給下拉 |
| `admin/src/app/api/v1/stock/screener/route.ts` | 修改 | 加 `strategy`/`weights` query param |
| `admin/src/app/api/v1/stock/fundamental/route.ts` | 修改 | 加 `strategy` query param |
| `admin/src/app/(dashboard)/stock-bot/stock/[symbol]/page.tsx` | 修改 | 基本面 tab 策略下拉 + 因子卡顯示 read-time weight |
| `admin/src/app/(dashboard)/stock-bot/screener/page.tsx` | 修改 | 策略下拉（由 strategies 端點驅動）+ 依 total 重排 |

---

## 邏輯變更點

### common
- `applyStrategy(detail, strategy=DEFAULT_STRATEGY): StockScore`：`weights = preset | 自訂`；`normalizeWeights` 只對 detail 現存因子重分配（缺 momentum/valuation 時不致總分為 0）；回傳含 `total`、各因子 `weight`/`weighted`。
- `normalizeWeights(weights, presentKeys)`：把缺席因子權重剔除後重新歸一化到和為 1。

### worker
- `computeScoreDetail(input)`：呼叫 5 個 per-factor scorer，回 `{version:2, factors:[{key,name,score,reason}]}`。
- `analysis.ts`：`scoreDetail = computeScoreDetail(...)`；`score = applyStrategy(scoreDetail,'balanced').total`。

### admin
- `getFundamental(symbol, strategy?)` 回 `applyStrategy(scoreDetail, strategy)`。
- `getScreener(strategy, weights?, limit)`：讀各檔最新 `scoreDetail` → `applyStrategy` 算 total → sort（不再依賴 DB `score`）。

## API 合約

| 端點 | 方法 | 請求格式變更 | 回應格式變更 |
| --- | --- | --- | --- |
| `/api/v1/stock/strategies` | GET | 無 | `ApiResult<ScoringStrategy[]>`（id/name/description/weights） |
| `/api/v1/stock/screener` | GET | 加 `strategy`、`weights` | rows 依所選策略 total 重排 |
| `/api/v1/stock/fundamental` | GET | 加 `strategy` | 回 `scoreDetail`(原始因子) + 該策略 `total` + factors(含 weight) |

## 回滾計劃

1. 還原 `score.ts`/`analysis.ts` 至單一 `computeStockScore` + 固定權重。
2. 移除 `scoring-strategy.ts`、`scorers/*`、strategies route，UI 下拉還原。
3. `score_detail` v1/v2 並存，read-time fallback map 保證舊頁不壞（毋須資料回滾）。

## 預期測試結果

- [ ] `applyStrategy` 對 5 因子 detail 算出正確加權 total
- [ ] `normalizeWeights`：缺 momentum/valuation 的 v1 detail 仍算出合理 total（不為 0、不 NaN）
- [ ] `name→key` fallback：v1 row（無 key）可被 read-time 正確分類
- [ ] `npm run type:check`（common/worker/admin）通過

## 風險評估

- `score_detail` Json 向後相容是最大風險：read-time 必須容忍缺 `version`/`key`/因子。
- common 改型別後須先 `npm run build`（common）再 type:check worker/admin。

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認
建立可調權重多策略評分骨架，作為 A/B/C/D 的共同地基。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| Worker 存原始因子、admin read-time 加權 | ✅ 採納 | 切策略零重算、舊資料相容 |
| momentum/valuation scorer 先 stub | ✅ 採納 | 讓骨架可獨立先上，A/C 再補實作 |

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

- `common/src/scoring-strategy.ts` — Write @ 2026-06-06 16:03
- `worker/src/ta/scorers/util.ts` — Write @ 2026-06-06 16:03
- `worker/src/ta/scorers/chips.ts` — Write @ 2026-06-06 16:03
- `worker/src/ta/scorers/tech.ts` — Write @ 2026-06-06 16:04
- `worker/src/ta/scorers/fund.ts` — Write @ 2026-06-06 16:04
- `worker/src/ta/scorers/momentum.ts` — Write @ 2026-06-06 16:04
- `worker/src/ta/scorers/valuation.ts` — Write @ 2026-06-06 16:04
- `worker/src/ta/score.ts` — Write @ 2026-06-06 16:05
- `common/src/scoring-strategy.ts` — Edit @ 2026-06-06 16:07
- `admin/src/app/api/v1/stock/strategies/route.ts` — Write @ 2026-06-06 16:09
- `admin/src/app/api/v1/stock/screener/route.ts` — Edit @ 2026-06-06 16:09
- `admin/src/app/api/v1/stock/fundamental/route.ts` — Edit @ 2026-06-06 16:09
