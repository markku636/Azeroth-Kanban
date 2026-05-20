# PRD — Selkie 事故調查 Agent

| 項目 | 內容 |
| --- | --- |
| 文件編號 | 20260519-001 |
| 版本 | v1.0 |
| 狀態 | ✅ 已實作 |
| 關聯 | 執行紀錄 `docs/logs/20260519-001-selkie-integration.md` |

---

## 1. 背景與目標

`Azeroth-Kanban` 原為個人 Kanban 看板(面試作業)。本次**移除看板領域功能**,保留其
Next.js 16 + Prisma + NextAuth + RBAC + 稽核 + i18n + Docker 的基礎架構,在其上建立
**Selkie** —— 用 LangChain Deep Agents + Gemini on Vertex AI 打造的 oncall 事故調查 agent。

**目標**:使用者建立「事故(Incident)」後,一鍵讓 Selkie 自動 triage(分級)、
調查(日誌 / metrics / 近期部署 / runbook)、產出證據充分的診斷報告,降低 oncall 認知負擔。

---

## 2. 名詞定義

| 名詞 | 說明 |
| --- | --- |
| Incident | 事故。具事故編號(code)、受影響服務、嚴重度、狀態(生命週期)。 |
| AgentRun | Selkie 的一次 triage 執行紀錄,含執行狀態、診斷報告。 |
| Selkie | 本專案的 oncall agent(`@azeroth/selkie` workspace,deepagents + Gemini)。 |
| triage | agent 對事故分級 + 根因調查 + 產出報告的完整流程。 |

---

## 3. 角色與權限

沿用既有 RBAC(admin / user / viewer)。新增 `incidents.*` 權限:

| 權限 | admin | user | viewer | 說明 |
| --- | :-: | :-: | :-: | --- |
| `incidents.view` | ✅ | ✅ | ✅ | 檢視自己負責的事故 |
| `incidents.create` | ✅ | ✅ | — | 建立事故 |
| `incidents.edit` | ✅ | ✅ | — | 編輯事故狀態 / 嚴重度 |
| `incidents.delete` | ✅ | — | — | 刪除事故 |
| `incidents.triage` | ✅ | ✅ | — | 觸發 Selkie 調查 |
| `incidents.view_all` | ✅ | — | — | 檢視 / 管理所有人的事故 |

未具 `incidents.view_all` 者僅能存取自己負責(ownerId)的事故。

---

## 4. 使用者故事與驗收條件(AC)

### US-1 — 事故列表
- **AC 1.1** 登入後 `/incidents` 以 `DataTable` 顯示事故列表。
- **AC 1.2** 每列顯示:事故編號、標題、服務、嚴重度 badge、狀態 badge、Selkie 調查狀態、建立時間。
- **AC 1.3** 無事故時顯示空狀態提示文字。
- **AC 1.4** 點擊任一列導向 `/incidents/{id}` 詳情頁。
- **AC 1.5** 無 `incidents.create` 權限者(viewer)看不到「新增事故」按鈕。

### US-2 — 建立事故
- **AC 2.1** 點「新增事故」開啟表單 Modal(標題、受影響服務、嚴重度、描述)。
- **AC 2.2** 標題與服務為必填;未填顯示錯誤提示,不送出。
- **AC 2.3** 建立成功顯示 toast,並自動導向新事故詳情頁。

### US-3 — 事故詳情與狀態
- **AC 3.1** 詳情頁顯示事故 metadata:受影響服務、來源、負責人、觸發時間、建立時間、描述。
- **AC 3.2** 具 `incidents.edit` 權限者可用下拉選單變更狀態(TRIGGERED / INVESTIGATING / MITIGATING / RESOLVED)。
- **AC 3.3** viewer 不顯示狀態下拉(唯讀)。

### US-4 — Selkie 自動 triage
- **AC 4.1** 詳情頁有「讓 Selkie 調查」按鈕(需 `incidents.triage` 權限)。
- **AC 4.2** 點擊後建立 AgentRun,狀態由 QUEUED → RUNNING。
- **AC 4.3** RUNNING 期間頁面每 3 秒自動輪詢、更新進度,無需手動重整。
- **AC 4.4** 成功後顯示 triage 摘要與 markdown 渲染的診斷報告。
- **AC 4.5** 失敗時顯示明確錯誤訊息(例如未設定 Vertex AI 憑證)。
- **AC 4.6** 調查完成後可按「重新調查」再跑一次。
- **AC 4.7** 已有進行中(QUEUED / RUNNING)的調查時,不可重複觸發。

### US-5 — 登入與權限守衛
- **AC 5.1** 未登入訪問 `/incidents` 導向 `/login`。
- **AC 5.2** 無 `incidents.view` 權限者經 `incidents/layout.tsx` 守衛導離。
- **AC 5.3** API 層以 ownerId 過濾,使用者無法存取他人事故(除非具 `view_all`)。

---

## 5. 資料模型

### Incident(`incidents`)
| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | String | 主鍵 |
| code | String unique | 事故編號(如 INC-1024) |
| title / service / description | String | 標題 / 服務 / 描述 |
| source | String | 來源(manual / pagerduty / ...) |
| status | enum IncidentStatus | TRIGGERED / INVESTIGATING / MITIGATING / RESOLVED |
| severity | enum IncidentSeverity? | SEV1–SEV4(可空,由 Selkie 評估) |
| triggeredAt / createdAt / updatedAt | DateTime | 時間戳 |
| ownerId | FK → Member | 負責人 |

### AgentRun(`agent_runs`)
| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| id | String | 主鍵 |
| incidentId | FK → Incident | 所屬事故 |
| status | enum AgentRunStatus | QUEUED / RUNNING / SUCCEEDED / FAILED |
| threadId | String | agent checkpointer thread |
| finalSummary / reportMarkdown | Text? | triage 摘要 / 完整報告 |
| error | Text? | 失敗原因 |
| startedAt / finishedAt / createdAt | DateTime? | 時間戳 |
| createdById | FK → Member | 觸發者 |

---

## 6. 系統架構

npm workspaces monorepo:`common`(共用型別)、`selkie`(`@azeroth/selkie`,agent 核心)、
`admin`(Next.js app)。

triage 流程:
```
建立 Incident → POST /api/v1/incidents/{id}/triage → 建立 AgentRun(QUEUED)
  → 背景執行 runTriage()(orchestrator + log/metrics/deploy/runbook 四個 subagent)
  → 結果寫回 AgentRun → 前端輪詢 /api/v1/agent-runs/{id} → 渲染報告
```

---

## 7. 非功能需求

- triage 為長時間任務(約 1–3 分鐘),以背景任務於 standalone Next.js node server 內執行,前端輪詢取進度。
- **Selkie 唯讀**:只調查、只建議,不改動任何基礎設施。
- 需 GCP 專案啟用 Vertex AI API 並提供憑證,Selkie 才能實際執行;未設定時 app 仍可正常使用,triage 以失敗狀態呈現。
- 沿用既有稽核(AuditLog)— 事故 / AgentRun 的建立、變更皆記錄。

---

## 8. 範圍外(後續迭代)

- 詳情頁對話面板:對 triage 結果向 Selkie 追問。
- 告警 webhook:自動由 PagerDuty / Alertmanager 告警建立事故並觸發調查。
- Selkie 介面字串 i18n(目前事故頁為繁中硬編碼)。
