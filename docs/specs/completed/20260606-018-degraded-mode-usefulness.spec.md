# 降級模式仍可用 + /signal 顯示綜合評分

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 關聯計劃書: 無

---

## 目標

修正「模擬對話」截圖中兩個讓機器人看起來壞掉的退化狀態：

1. 白話問答回「（目前無法取得 AI 回答：Claude 未就緒）」——改成**資料驅動的技術快答**（規則訊號 + 指標），即使 Claude 未授權也給得出有用回覆。
2. `/signal 2330` 回「HOLD（信心 0）綜合評分 0.0。 無明顯訊號。」——系統其實已算出綜合評分（DB `score`=57）卻被丟棄；改成**顯示綜合評分 + 白話結論 + 參考進出場**。
3. 規則訊號 rationale 在「當日無事件」時不再只寫「無明顯訊號」，改為**描述當前趨勢態**（均線排列 / 價對月線 / RSI / KD）。

> 註：真正讓 Claude「就緒」需使用者於 `.env` 填入 `ANTHROPIC_API_KEY` 或 `CLAUDE_CODE_OAUTH_TOKEN`（金鑰只能由使用者提供，AI 不得偽造）。本 Spec 補上 `.env` 缺漏的設定區塊（設定檔，豁免攔截），其餘為程式碼降級體驗改善。

## 背景

診斷（2026-06-06）確認：

- worker 容器啟動 log：`"finmindToken":"missing","claude":"cli-session","line":"missing"`，且重複 `claudeReason 失敗 — "Not logged in · Please run /login"`。根因：`.env` 為 example 模板，缺 `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` / `FINMIND_TOKEN`，`docker-compose` 以 `${VAR:-}` 解析成空 → worker 無授權。
- DB 實況：`stock_daily_price` 2330 有 **322 筆**（2025-02-11 ~ 2026-06-05），資料充足且新鮮（06-06 為週六無交易）。最新 `analysis_signal`：action=HOLD、confidence=0、**score=57**、rationale=「綜合評分 0.0。 無明顯訊號。」。
- 結論：Problem 2 非「資料不足」，而是規則引擎為**事件驅動**（只在交叉 / 超買超賣 / 爆量等事件當下加分），平靜日 score=0 屬正常；但 `/signal` 與 QA 降級回覆**丟棄**了已算出的綜合評分（57）、指標與 KD 紅綠燈，顯得無用。

> 參考既有資產：`admin/src/lib/kd-verdict.ts` 已有「白話結論」概念（KD 紅綠燈），本 Spec 在 `/signal` 採等價的輕量白話結論，避免 reply 仍只有事件訊號。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema 變更 |
| `common` | ❌ | 無 |
| `worker` | ✅ | QA 降級答覆 + 訊號 rationale 趨勢態描述 |
| `admin` | ✅ | `/signal` 回覆加綜合評分 + 白話結論 |

---

## 受影響檔案

### worker

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `worker/src/jobs/qa.ts` | 修改 | Claude 回 null 時，用已算出的 signal + indicators 組「技術快答」取代「未就緒」空回覆 |
| `worker/src/ta/signals.ts` | 修改 | 無事件時 rationale 改描述趨勢態（均線排列 / 價對月線 / RSI / KD），取代「無明顯訊號」 |
| `worker/src/jobs/digest.ts` | 修改 | 漲幅摘要降級文案改使用者向（不外洩「缺 Claude 授權」技術細節） |
| `worker/src/agent/deepAgent.ts` | 修改 | 降級研究報告區分「抓取失敗」與「查無資料」；catch 補 log |
| `worker/src/agent/claudeResearch.ts` | 修改 | Claude 省略 summary 時改用降級文案，避免三處顯示空白摘要 |

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/stock-service.ts` | 修改 | `/signal` reply 加上「綜合評分 N/100」+「白話結論」+ 參考進出場 |

### 設定（豁免攔截）

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `.env` | 修改 | 補上 `FINMIND_TOKEN` / `ANTHROPIC_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` 空值 + 註解 |
| `.env.example` | 修改 | 同步設定區塊與說明 |

---

## 邏輯變更點

- `worker/src/jobs/qa.ts`：保留結構化 `snapshot`（symbol/last/ind/sig），`if (!answer)` 分支改呼叫 `buildDegradedAnswer()`：有 snapshot → 「（AI 深度研判暫不可用，以下為規則訊號快答）」+ 訊號 + 指標 +（若有）進出場 + 免責；無 snapshot → 引導訊息。純函式、無新增相依、無新增資料載入。
- `worker/src/ta/signals.ts`：新增 `describeTrend(indicators, lastClose)` 純函式；`rationale` 在 `positives.length === 0 && negatives.length === 0` 時改用它。**不動** action / score / confidence 計算邏輯（零語意風險），僅文字增益。新增 `StockIndicators` 型別 import。
- `admin/src/lib/stock-service.ts`：新增 `plainVerdict(action, confidence, score)` 輕量白話結論；`/signal` reply 加「綜合評分 ${score}/100」與結論行、（若有）參考進出場行。

## 回滾計劃

1. 還原三個程式碼檔的對應區塊；`.env` / `.env.example` 移除新增區塊（或保留空值區塊，無副作用）。

## 預期測試結果

- [ ] `npm run type:check` 通過（worker + admin）
- [ ] worker `vitest` 既有測試不被破壞（agent / ta）
- [ ] 重建 worker/admin 容器後，重跑 2330 分析：`analysis_signal.rationale` 含趨勢態描述
- [ ] `/signal 2330` 回覆含「綜合評分 57/100」與白話結論
- [ ] 白話問句（含代號）在 Claude 未授權時回「技術快答」而非「未就緒」

## 風險評估

- rationale 文字變更會影響既有依賴該字串的測試（若有）與 LINE 訊號卡顯示；屬顯示文字，無邏輯風險。
- `/signal` reply 變長；console / LINE 皆可容納。
- 真正讓 Claude 就緒仍需使用者提供金鑰，本 Spec 不含金鑰。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

使用者看到「模擬對話」截圖兩段退化訊息（Claude 未就緒 / /signal 無明顯訊號），要求「查並修正」。診斷後確認根因為 `.env` 缺金鑰 + 降級回覆丟棄已算資料。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 不偽造 Claude 金鑰，改補 `.env` 區塊 + 大幅改善降級體驗 | ✅ 採納 | 金鑰只能由使用者提供；同時讓無金鑰時也有用 |
| `/signal` 採輕量 `plainVerdict` 而非引入 `kd-verdict` 全套 | ✅ 採納 | reply 僅需一句白話結論，避免在 service 層拉前端聚合依賴 |
| 不改 `generateSignal` 的 score/action 計算 | ✅ 採納 | 事件驅動為設計本意；僅增益 rationale 文字，零語意風險 |

### 產出摘要

<!-- 完成後補 -->
