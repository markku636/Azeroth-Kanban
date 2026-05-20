/**
 * 內嵌知識庫資料 —— runbook、嚴重度規範、升級政策。
 *
 * 刻意以「程式碼常數」而非檔案系統 .md 形式存在:selkie 套件會被打包進
 * Next.js bundle,打包後無法用 import.meta.url / fs 讀取相鄰的 knowledge/ 目錄。
 * 內嵌常數則不論是否被打包都能正確運作。
 */

export interface RunbookDoc {
  slug: string;
  title: string;
  content: string;
}

export const RUNBOOKS: RunbookDoc[] = [
  {
    slug: "oom-killed",
    title: "Runbook:Pod OOMKilled / 記憶體耗盡",
    content: `# Runbook:Pod OOMKilled / 記憶體耗盡

## 適用症狀
- Pod 狀態出現 OOMKilled、exit code 137。
- 日誌出現 java.lang.OutOfMemoryError: Java heap space。
- Pod 反覆重啟、進入 CrashLoopBackOff。
- 記憶體 metric 持續單調攀升,直到貼著 container memory limit。
- 錯誤率與延遲在 pod 被 kill / 重啟後同步飆升。

## 診斷步驟
1. 用 query_metrics 看記憶體使用率:是「緩慢單調攀升」(記憶體洩漏特徵),
   還是「突然階梯式跳升」(流量暴增或設定變更特徵)。
2. 用 query_logs 找 OutOfMemoryError 的 stack trace,確認是哪個類別 / 元件耗用記憶體。
3. 用 list_recent_deploys 看記憶體開始攀升前不久是否有部署。
4. 對可疑部署用 get_pull_request 檢視 diff —— 特別注意新增的快取、緩衝區、集合,
   是否「只增不刪」、缺少大小上限 / TTL / eviction 機制。
5. 用 search_past_incidents 查是否有相同模式的前例。

## 常見根因
- 新增的記憶體快取沒有大小上限或 eviction(最常見的記憶體洩漏)。
- 一次將過大的查詢結果集載入記憶體。
- container memory limit 設定過低,或 JVM -Xmx 與 limit 不相稱。

## 建議處置(皆需由人類執行 / 核准)
- 止血:回滾到上一個正常版本(見 rollback-deployment runbook)。
- 根因修復:為快取 / 集合加上大小上限與 eviction(例如 Caffeine LRU,設 maxSize + TTL)。
- 暫時緩解:若無法立即回滾,可調高 memory limit 爭取時間,但這不是根因修復。
- 在重啟前盡量保留一份 heap dump 供後續分析。
`,
  },
  {
    slug: "high-error-rate",
    title: "Runbook:HTTP 5xx 錯誤率飆升",
    content: `# Runbook:HTTP 5xx 錯誤率飆升

## 適用症狀
- 服務 HTTP 5xx 比例明顯升高(例如 > 10%)。
- 使用者回報功能失敗或頁面錯誤。

## 診斷步驟
1. 用 query_metrics 確認錯誤率飆升的「起始時間」。
2. 用 list_recent_alerts 看告警的先後順序 —— 最先觸發的告警常常最接近根因。
3. 用 query_logs 看 5xx 對應的錯誤訊息:是本服務自身的例外(如 OutOfMemoryError、
   NullPointerException),還是對下游 / 相依服務的呼叫失敗(如 SocketTimeoutException)。
4. 用 list_recent_deploys 比對「錯誤率起始時間」與「部署時間」。
5. 若錯誤來自下游服務,改去調查那個下游服務(見 downstream-dependency-timeout runbook)。

## 常見根因
- 自身近期部署引入 bug 或資源問題。
- 下游 / 相依服務故障或變慢。
- 資料庫、快取、連線池等資源耗盡。

## 建議處置(皆需由人類執行 / 核准)
- 若與自身近期部署相關 → 回滾。
- 若為下游服務問題 → 升級給下游服務 owner,並考慮啟用熔斷 / 降級。
`,
  },
  {
    slug: "rollback-deployment",
    title: "Runbook:回滾有問題的部署",
    content: `# Runbook:回滾有問題的部署

## 何時使用
- 已確認某次近期部署造成事故(部署時間與事故 / 異常起始時間吻合,且 PR diff 指向問題)。
- 需要快速止血。

## 步驟(由人類執行;SEV1 / SEV2 建議先在 incident channel 知會)
1. 從 list_recent_deploys 找出「上一個正常版本」。
2. 透過 CI/CD 觸發回滾到該版本(或 kubectl rollout undo)。
3. 觀察記憶體 / 錯誤率 / 延遲等 metric 是否回穩。
4. 確認 pod 不再 crashloop、readiness probe 恢復正常。
5. 在 incident channel 更新狀態。

## 注意
- 回滾屬於變更 production 的動作,需 service owner 或 oncall lead 核准後執行。
- 回滾僅止血;仍需在原 PR 修好根因,避免再次部署時重現相同問題。
`,
  },
  {
    slug: "downstream-dependency-timeout",
    title: "Runbook:下游 / 相依服務逾時",
    content: `# Runbook:下游 / 相依服務逾時

## 適用症狀
- 日誌出現 SocketTimeoutException、Read timed out、connection timeout。
- 錯誤訊息中提到對「另一個服務」的呼叫失敗。
- 出現 circuit breaker OPEN(熔斷開啟)字樣。
- 本服務自身資源(記憶體 / CPU)正常,但延遲與錯誤率仍飆升。

## 診斷步驟
1. 從 query_logs 找出「是哪一個下游服務」呼叫逾時。
2. 改去調查那個下游服務:用 query_metrics 看它的延遲、用 list_recent_deploys 看它的部署。
3. 下游服務若有近期部署,用 get_pull_request 檢視 diff —— 特別注意連線池、
   執行緒池、逾時 / 重試等設定的調整。
4. 用 search_past_incidents 查相似前例。

## 常見根因
- 下游服務近期部署把連線池 / 執行緒池調太小,流量高峰時連線不足、請求排隊逾時。
- 下游服務自身過載或故障。

## 建議處置(皆需由人類執行 / 核准)
- 若為下游服務的近期部署造成 → 通知下游服務 owner 回滾。
- 上游可暫時調整熔斷 / 逾時 / 重試以降低影響,但根因仍在下游,需一併處理。
`,
  },
];

export const SEVERITY_GUIDE = `# 嚴重度分級規範(Severity Guide)

oncall agent 依「使用者 / 營收影響範圍」評定事故嚴重度。

## SEV1 — 重大
- 全站中斷,或核心營收功能(結帳 checkout、付款 payments、登入)完全無法使用。
- 大量使用者受影響。

## SEV2 — 高
- 核心功能嚴重降級或部分中斷(例如錯誤率 > 10%、延遲飆升數倍、部分 pod crashloop)。
- 多數使用者明顯受影響,但非全面中斷,通常仍有部分請求成功。

## SEV3 — 中
- 次要功能受影響,或效能輕度降級。影響有限,通常有 workaround。

## SEV4 — 低
- 輕微問題,幾乎無使用者可感知的影響。

## 判定提示
- 核心營收路徑(checkout-api / payments-api)出現大量 5xx 或 pod crashloop → 通常 SEV1。
- 單一服務延遲升高但多數請求仍成功 → 視影響範圍評 SEV2 / SEV3。
- 評定時以「使用者實際受影響程度」為準,而非單一 metric 數字。
`;

export const ESCALATION_POLICY = `# 升級政策(Escalation Policy)

## 服務 owner
- checkout-api → Team Checkout(#team-checkout)
- payments-api → Team Payments(#team-payments)
- bank-gateway → Team Payments(#team-payments)

## 升級規則
- SEV1:立即在 #incident 開 incident channel,page service owner 與 oncall lead。
- SEV2:通知 service owner 的 team channel,15 分鐘內無回應則 page。
- SEV3 / SEV4:於 team channel 留言,正常工時處理即可。

## 何時需要升級
- 根因涉及其他團隊的服務(下游 / 相依服務)→ 同時通知該服務的 owner team。
- 已知修復動作具風險(回滾、變更 production 設定、重啟)→ 需 service owner 或 oncall lead 核准。
- 30 分鐘內仍無法定位根因 → 升級給 oncall lead。
`;
