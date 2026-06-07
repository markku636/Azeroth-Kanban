# 股票機器人 — 基本面健診 + 多因子評分(Phase 2)

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: ai-frolicking-fairy.md（優化計劃 Phase 2）

## 目標

加入基本面(月營收 YoY/MoM、EPS、本益比、殖利率)+ **可解釋多因子評分**(籌碼 40% + 技術 35% + 基本面 25%)。Spike 已驗證 4 個 FinMind dataset 皆免費。

## 受影響檔案
### prisma
| 檔案 | 動作 | 說明 |
|---|---|---|
| `prisma/schema.prisma` | 修改 | 新增 `StockFundamental`;`AnalysisSignal` 加 `score`/`scoreDetail` |
| `prisma/migrations/20260606140000_add_fundamental_score/migration.sql` | 新增 | 表 + 欄位 |

### common
| `common/src/stock-types.ts` `index.ts` | 修改 | `StockFundamentalDto`、`StockScore` 型別 |

### worker
| `worker/src/data/fundamentals.ts` | 新增 | fetchMonthlyRevenue / fetchValuation(PER) / fetchEps + loadFundamentals(算 YoY/MoM, upsert) |
| `worker/src/ta/score.ts` | 新增 | computeStockScore(可解釋,純函式) |
| `worker/src/jobs/analysis.ts` | 修改 | 抓基本面 + 算評分 → 存 StockFundamental + AnalysisSignal.score |
| `worker/src/agent/claudeResearch.ts` | 修改 | prompt 注入基本面 + 評分 |

### admin
| `admin/src/lib/stock-service.ts` | 修改 | getFundamental(symbol) |
| `admin/src/app/api/v1/stock/fundamental/route.ts` | 新增 | GET 基本面+評分 |
| `admin/src/app/(dashboard)/stock-bot/console/page.tsx` | 修改 | 基本面卡 + 健診評分卡 |

## 邏輯
- `loadFundamentals(symbol)`：月營收近 14 月 → 最新月 revenue、MoM、YoY;PER 最新(PER/dividend_yield/PBR);EPS 最新(type=EPS)。upsert StockFundamental(symbol, period, revenue, revenue_yoy, revenue_mom, eps, per, pbr, dividend_yield)。
- `computeStockScore({ chipBias, signal, fundamental })` → `{ total(0~100), factors:[{name,score,weight,reason}] }`：
  - 籌碼(40%):由 chipBias(-2~2)映射 0~100。
  - 技術(35%):由 signal.action+confidence + 均線多頭 映射。
  - 基本面(25%):營收 YoY>0、PER 合理、殖利率 → 加分。
- analysis：算完存 StockFundamental + 把 score 寫入 AnalysisSignal.score/scoreDetail。
- 報告:facts 加「月營收 YoY/MoM、EPS、PER、殖利率」+ 評分。
- console:基本面卡(營收/EPS/PER/殖利率)+ 評分卡(總分 + 各因子理由)。

## 測試
- [x] spike(4 dataset 免費已驗)
- [ ] type-check;computeStockScore 純函式測試(籌碼+技術+基本面 各情境)
- [ ] E2E:分析 2330 → StockFundamental 落庫、評分顯示

## 實際變更
<!-- hook -->
## Bug Log
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/prisma/migrations/20260606140000_add_fundamental_score/migration.sql` — Write @ 2026-06-06 00:47
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/data/fundamentals.ts` — Write @ 2026-06-06 00:48
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/worker/src/ta/score.ts` — Write @ 2026-06-06 00:48
- `E:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/stock-deep-agent/admin/src/app/api/v1/stock/fundamental/route.ts` — Write @ 2026-06-06 00:50
