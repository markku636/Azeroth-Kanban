# 股票機器人 — 國際盤 / 期貨夜盤（美股四大指數 + 台指期夜盤盤後籌碼）

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: `docs/plans/doing/20260606-002-stock-global-market.md`

## 目標

在現有大盤頁最上方新增「國際盤 / 期貨夜盤」區塊：美股四大指數（道瓊/S&P500/那斯達克/費半）+ 台指期夜盤（收盤、漲跌、期現價差、三大法人未平倉）。每日早上自動抓，亦可手動「更新國際盤」。

> Spike（已實測）：Yahoo `v8/finance/chart/^DJI|^GSPC|^IXIC|^SOX`（免 key、需 UA）；FinMind `TaiwanFuturesDaily`(TX, after_market 近月) 用 spread/spread_per 當夜盤漲跌；FinMind `TaiwanFuturesInstitutionalInvestors`(TX) 取三大法人未平倉。

## ⚠️ 資料庫異動

新增 1 張表 `global_market_daily`（不動既有表）。詳見計劃書「資料表異動」。

## 受影響檔案

### prisma
| `prisma/schema.prisma` | 修改 | 新增 `GlobalMarketDaily`(date, us_indices Json, txf_night_close/_change_pct/_change_point, txf_basis, fut_chips Json) |
| `prisma/migrations/20260606170000_add_global_market_daily/migration.sql` | 新增 | global_market_daily 表 |

### common
| `common/src/stock-types.ts` | 修改 | `StockJobType.GLOBAL` + `UsIndexQuote` / `FuturesChip` / `GlobalMarketData` 型別 |

### worker
| `worker/src/data/us-market.ts` | 新增 | `fetchUsIndices()` 打 Yahoo v8 chart（四大指數，帶 UA、近兩根日 K 算漲跌） |
| `worker/src/data/futures.ts` | 新增 | `fetchTxfNight()` / `fetchTxfChips()`（FinMind 近月夜盤 + 三大法人未平倉） |
| `worker/src/data/global-market.ts` | 新增 | `loadGlobalMarket()` 併抓 + 讀 `MarketDaily.taiexClose` 算基差 + upsert |
| `worker/src/queue/queues.ts` | 修改 | global 佇列 + `enqueueGlobal` |
| `worker/src/jobs/global.ts` | 新增 | `processGlobal` |
| `worker/src/jobs/workers.ts` | 修改 | global worker（concurrency 1 + DLQ） |
| `worker/src/jobs/scheduler.ts` | 修改 | daily-global 排程（07:00 週二~六） |

### admin
| `admin/src/lib/stock-queue.ts` | 修改 | `enqueueGlobal()` + `EDITABLE_SCHEDULES['daily-global']` + 監控佇列清單 |
| `admin/src/lib/stock-service.ts` | 修改 | `getGlobalMarket()` / `triggerGlobalMarket()` |
| `admin/src/app/api/v1/stock/global/route.ts` | 新增 | GET 國際盤 + POST 觸發更新 |
| `admin/src/app/(dashboard)/stock-bot/market/_components/global-board.tsx` | 新增 | 國際盤 / 夜盤區塊（美股卡 + 夜盤卡 + 三大法人表 + 更新鈕） |
| `admin/src/app/(dashboard)/stock-bot/market/page.tsx` | 修改 | 最上方掛載 `<GlobalBoard />` |
| `admin/src/config/data-sources.ts` | 修改 | `DATA_SOURCE_TABLE` 補 Yahoo（美股指數）/ TaiwanFuturesDaily（夜盤）/ TaiwanFuturesInstitutionalInvestors（期貨三大法人）；about 頁自動帶出 |
| `admin/src/locales/zh-TW.json` `admin/src/locales/en.json` | 修改 | 新區塊文案 key（如需） |

## 邏輯

- **美股**：對 4 個 symbol 各打 Yahoo `range=5d&interval=1d`；close = `meta.regularMarketPrice` ?? 最後一根非空 bar；prevClose = 倒數第二根非空 bar；changePoint/Pct 由兩者算；name 取 `meta.shortName`；任一 symbol 失敗只略過該檔。
- **夜盤**：`TaiwanFuturesDaily` TX → 篩 `contract_date` 為 6 碼（排除價差合約）且 `volume>0`、取最小（近月）；`trading_session='after_market'` 取最新日；`txfNightClose=close`、`txfNightChangePoint=spread`、`txfNightChangePct=spread_per`。
- **基差**：`txfBasis = txfNightClose − 最新 MarketDaily.taiexClose`（夜盤現貨不交易，用前一日加權收盤當現貨參考）。
- **三大法人**：`TaiwanFuturesInstitutionalInvestors` TX 取最新日 3 法人；`netOi = long_open_interest_balance_volume − short_open_interest_balance_volume`，映射 外資→foreign / 投信→trust / 自營商→dealer。
- **錯誤隔離**：Yahoo / 期貨 / 三大法人任一失敗只讓該段為 null，不整批失敗。
- **顯示**：漲跌色彩沿用大盤頁 `changeClass()`（台灣慣例漲紅跌綠）。

## 測試
- [x] 資料源煙測（Yahoo + FinMind 期貨）回傳欄位符合
- [x] `prisma migrate` 建表 `global_market_daily`（migration 20260606091348）
- [x] 跑 global job → upsert 成功（4 指數 + 夜盤 42220/-6.65% + 基差 -2850.94 + 三大法人）
- [x] 監控頁排程註冊 `daily-global`（worker scheduler registered count:5）
- [x] type-check（admin + worker）+ lint（0 errors）通過
- [ ] UI 實機渲染：需重啟 admin dev server 載入新 Prisma client 後驗證（程式碼已 type-check 通過）

## 踩坑 / 可複用知識（資料源整合）
- **Yahoo v8 chart 需帶瀏覽器 User-Agent**，否則被擋（非 200）。收盤用 `meta.regularMarketPrice`、漲跌用 `close[]` 最後兩根非空 bar。
- **FinMind `TaiwanFuturesDaily` 混合「近月」與「價差合約」**：`contract_date` 6 碼純數字才是 outright 近月，價差合約形如 `202607/202703`（多為 0 值）。近月 = 同日、outright、`volume>0` 中 `contract_date` 最小者。
- **夜盤（after_market）日期 = 次一交易日**（FinMind 慣例）；`spread`/`spread_per` 已是「vs 前一日盤結算」的漲跌點/%，直接採用免自算。
- **after_market 的 `open_interest` 恆為 0** → 未平倉一律取自 `TaiwanFuturesInstitutionalInvestors`（外資/投信/自營商，netOi = long_oi − short_oi）。
- FinMind 期貨資料集**免 token 即可取**（300/hr）。

## 實際變更
- 新增表 `global_market_daily` + migration、`StockJobType.GLOBAL` + 共用 DTO。
- worker：us-market / futures / global-market 資料層 + `processGlobal` + global 佇列/worker/排程（07:00 週二~六）。
- admin：`getGlobalMarket`/`triggerGlobalMarket` + `/api/v1/stock/global` + `GlobalBoard` 元件掛上大盤頁 + 資料來源頁補三來源。
- E2E 實測：global job 落庫資料與真實行情一致（費半 -10.26%、外資台指期淨空 -69146 口）。
<!-- hook -->
## Bug Log
- `admin/src/app/(dashboard)/stock-bot/about/page.tsx` — Edit @ 2026-06-06 09:45
- `admin/src/app/(dashboard)/stock-bot/market/page.tsx` — Edit @ 2026-06-06 09:48
- `worker/src/data/us-market.ts` — Write @ 2026-06-06 10:52
- `worker/src/data/futures.ts` — Write @ 2026-06-06 10:53
- `worker/src/data/global-market.ts` — Write @ 2026-06-06 10:53
- `worker/src/jobs/global.ts` — Write @ 2026-06-06 10:54
- `admin/src/app/api/v1/stock/global/route.ts` — Write @ 2026-06-06 10:57
- `admin/src/app/(dashboard)/stock-bot/market/_components/global-board.tsx` — Write @ 2026-06-06 10:58
- `admin/src/config/data-sources.ts` — Edit @ 2026-06-06 11:00
