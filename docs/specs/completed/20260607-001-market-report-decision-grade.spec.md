# 股票機器人 — 大盤 AI 盤勢解讀報告升級為「決策級」報告

> 建立日期: 2026-06-07
> 狀態: ✅ 已完成
> 關聯計劃書: 無（中型，沿用 docs/specs/completed 之 20260606-020-market-ai-report 管線）

---

## 目標

把現有「大盤 AI 盤勢解讀報告」從泛泛的 `## 綜合研判`，升級為**可作為隔日買賣依據的決策級報告**：新增「隔日劇本」「明日觀察重點」「明確方向偏向與操作依據」三大區段，並在餵給 Claude 的事實清單中補上**衍生訊號**（基差佔比、隱含開盤偏離、漲跌比、外資未平倉強度、SOX 事件旗標）。降級（Claude 未就緒）版本同步補上方向偏向與劇本骨架。

## 背景

使用者在 `/stock-bot/market` 看盤後數據（夜盤 -6.65%、基差 -2,850、外資台指期淨空 -69,146 口、SOX -10.26%），希望系統自動產出有操作依據的報告。所有資料早已落庫並餵進 prompt，缺的只是 prompt 結構與衍生訊號 → 純 worker 端改動，無 DB／無前端／無 migration。

> 參考實作：`worker/src/agent/claudeMarketResearch.ts`、`worker/src/agent/marketReportAgent.ts`
> 報告 body 於 `admin/src/app/(dashboard)/stock-bot/market/page.tsx:299-301` 以 `whitespace-pre-wrap` 純文字呈現，新增 `##` 區段會自動顯示、無需動前端。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema / migration 變更 |
| `common` | ❌ | `MarketReportDto` 維持不變 |
| `worker` | ✅ | prompt + 衍生訊號 + 降級報告強化 |
| `admin` | ❌ | API / UI 維持不變 |

## 建議開發順序

1. `worker` — `claudeMarketResearch.ts`（衍生訊號 + facts + prompt + summary）→ `marketReportAgent.ts`（降級報告）

---

## 受影響檔案

### worker

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/agent/claudeMarketResearch.ts` | 修改 | 新增並 export `buildDerivedSignals()`；`buildFacts()` 併入衍生訊號；重寫 prompt 要求決策級結構；`summary` 引導語改「一句話方向結論」 |
| `worker/src/agent/marketReportAgent.ts` | 修改 | 重寫 `buildMarketFallbackReport()`：規則式方向分數 → 方向偏向 + sentiment；body 補隔日劇本／觀察重點／方向偏向骨架；引用 `buildDerivedSignals()` |

---

## 邏輯變更點

### worker — `claudeMarketResearch.ts`

- 新增具名常數：`FOREIGN_OI_EXTREME = 60000`、`FOREIGN_OI_NOTABLE = 30000`、`SOX_CRASH_PCT = -5`。
- 新增 `buildDerivedSignals(...)`（純函式，回傳 `string[]` 衍生訊號行）：
  - 基差佔比 = `basis / taiexClose * 100`；推導隱含開盤偏離（負＝隱含開低約 X%）。
  - 漲跌比 = `decliners / max(advancers, 1)` + 廣度方向。
  - 外資未平倉強度：依 `|foreign.netOi|` 對門檻 → 極端／明顯／輕微 + 淨空/淨多方向。
  - 美股最弱指數；SOX `changePct <= SOX_CRASH_PCT` → 事件級重挫旗標（對台股權值衝擊）。
- `buildFacts()` 末段併入 `【衍生訊號】` 區塊。
- prompt：`summary` 首句＝一句話方向結論；`body` 區段改為 `## 一句話結論 / ## 國際盤 / ## 大盤指數與廣度 / ## 類股輪動 / ## 期貨與籌碼（基差雙面刃）/ ## 隔日劇本（2~3 情境）/ ## 明日觀察重點 / ## 方向偏向與操作依據`；追加「不得保證走勢、提醒跳空與消息面風險」。

### worker — `marketReportAgent.ts`

- 引用 `buildDerivedSignals()`（§複用，避免重複）。
- `computeDirectionScore(...)`：對 TAIEX 漲跌、廣度、基差佔比、外資淨未平倉、SOX 各給具名權重 +/- 分 → 加總 → `sentiment` + 方向偏向文字。
- body 補 `## 隔日劇本`（規則式）、`## 明日觀察重點`（固定清單）、`## 方向偏向與操作依據`（由分數產生），維持 `degraded: true` 與「資料摘要版」標示。

---

## 回滾計劃

1. 回退 `worker/src/agent/claudeMarketResearch.ts` 與 `marketReportAgent.ts` 至上一版本，重建/重啟 worker。

## 預期測試結果

- [ ] `npm run type:check` 全綠（worker）
- [ ] 正常路徑：報告 body 出現 `## 隔日劇本`／`## 明日觀察重點`／`## 方向偏向與操作依據`，且基差/外資未平倉/SOX 解讀有出現；`summary` 首句為一句話方向結論
- [ ] 降級路徑：資料摘要版也有方向偏向與劇本骨架，`degraded=true` 提示出現
- [ ] 以當前盤後數據人工檢視結論合理偏空、未杜撰數字

## 風險評估

- LLM 仍可能偏離格式：`extractJson` 容錯 + 降級保底，不影響穩定性。
- 衍生訊號全為確定性計算，不引入新外部資料源、不影響抓取流程。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

<!-- 開發中追加 -->

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

把大盤 AI 報告升級為決策級（隔日劇本 + 觀察重點 + 明確方向偏向），純 worker 端，無 DB/前端改動。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 核心版（只改 worker）vs 加前端卡片 | ✅ 核心版 | 資料與管線已齊備，prompt 升級即達標、零風險 |
| 操作語氣：明確方向偏向 vs 純情境觀察 | ✅ 明確方向偏向（附風險聲明） | 使用者要「買賣依據」，但保留停損/跳空提醒 |
| 衍生訊號於 TS 端確定性計算 | ✅ 採納 | 降低 LLM 杜撰數字、推論更穩定 |

### 產出摘要

<!-- 完成後更新 -->
- `worker/src/agent/claudeMarketResearch.ts` — Write @ 2026-06-06 17:15
- `worker/src/agent/marketReportAgent.ts` — Write @ 2026-06-06 17:16
- `worker/src/agent/marketReportAgent.ts` — Edit @ 2026-06-06 17:16
