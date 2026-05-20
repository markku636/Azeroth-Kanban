# 驗證報告 — Selkie 事故 Agent

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-05-19 |
| 對象 | 執行中的 Docker 容器(`http://localhost:3010`) |
| 方法 | 對執行中容器的端到端 API 驗證(`.tmp/verify-selkie.sh`) |
| 關聯 | PRD `docs/requirements/completed/20260519-001-selkie-incident-agent.md` |

---

## 1. 執行環境

`docker compose ps` —— 三容器皆 Up:

| 容器 | 狀態 |
| --- | --- |
| kanban-postgres | Up(healthy) |
| kanban-keycloak | Up(healthy) |
| kanban-admin | Up |

DB 已套用 `init_selkie` migration、seed 完成(16 權限 / 3 帳號 / 2 範例事故)。

---

## 2. 驗證項目與結果 — 12 / 12 通過

| # | 項目 | 對應 AC | 結果 |
| --- | --- | --- | --- |
| 1 | admin 登入,session 建立 | AC 5.x | ✅ |
| 2 | 事故列表 API 回 success | AC 1.1 | ✅ |
| 3 | 列表含 seed 事故 INC-1024 | AC 1.1 | ✅ |
| 4 | 列表含 seed 事故 INC-1025 | AC 1.1 | ✅ |
| 5 | 建立事故 POST 成功 | AC 2.1 | ✅ |
| 6 | 缺必填欄位被擋 | AC 2.2 | ✅ |
| 7 | GET 單一事故成功 | AC 3.1 | ✅ |
| 8 | 更新狀態 → INVESTIGATING | AC 3.2 | ✅ |
| 9 | 觸發 Selkie triage,建立 AgentRun | AC 4.1 / 4.2 | ✅ |
| 10 | agent-runs API 可輪詢,狀態合法 | AC 4.3 | ✅ |
| 11 | viewer 建立事故被擋(HTTP 403) | AC 1.5 / 5.3 | ✅ |
| 12 | viewer 觸發 triage 被擋(HTTP 403) | AC 5.3 | ✅ |

## 3. Selkie triage 行為

觸發後 AgentRun 進入 `FAILED`,`error` 欄位:
`The file at /app/service-account.json does not exist...`

→ 符合預期(AC 4.5):未掛載 GCP Vertex 憑證時,背景 triage 任務優雅失敗並回報明確錯誤;
API、背景任務、錯誤處理流程皆正常。掛載 service account 金鑰後即可實際執行 LLM 調查。

## 4. 瀏覽器層級 MCP 驗證 — 已完成(Claude Preview MCP)

`Claude in Chrome` MCP 未連線(需使用者端 Chrome 擴充功能在線)。改用 **`Claude Preview` MCP**
啟動一份 Selkie admin 實例(`next dev` @ :3011,連同一個 Docker postgres),
透過 preview 瀏覽器逐一驗證 UI:

| 畫面 | 驗證內容 | 結果 |
| --- | --- | --- |
| 登入頁 | 帳密表單正常渲染 | ✅ |
| 登入 | admin 帳密登入 → 導向 `/incidents` | ✅ |
| 側邊選單 | 「Selkie 事故」選單項存在;Kanban 已完全移除 | ✅ |
| 事故列表 | `DataTable` 顯示 seed 事故 INC-1024 / INC-1025,嚴重度 / 狀態 / Selkie badge 正確 | ✅ |
| 事故詳情 | metadata 卡、狀態下拉、「Selkie 事故診斷」區、「重新調查」按鈕 | ✅ |
| triage 失敗呈現 | INC-1024 詳情頁紅框顯示「調查失敗」+ 錯誤訊息(service-account.json 不存在) | ✅(AC 4.5) |

## 5. 結論

執行中的 Selkie 部署驗證**全數通過**:
- API / 資料 / 權限 / agent 觸發層級 — 12 / 12(curl 對 Docker 容器)。
- 瀏覽器 / UI 層級 — 登入、選單、事故列表、詳情頁、triage 失敗呈現皆正常(Claude Preview MCP)。

唯一未實測的是 Selkie 的實際 LLM 調查 —— 需掛載 GCP Vertex 憑證(見 § 3),屬環境設定而非程式問題。
