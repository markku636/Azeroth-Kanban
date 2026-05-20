# Selkie — AI 事故調查 Agent

在 Next.js + Prisma + RBAC 的後台骨架上,內建一個用 **LangChain Deep Agents** + **Gemini on Vertex AI**
打造的 oncall 事故調查 agent —— **Selkie**。

`docker compose up` 後就是一個會「自己出事」的擬真 oncall 環境:**模擬微服務被注入故障 →
產生真實錯誤日誌進 ELK → 自動發告警給 Selkie → Selkie 查真實的 Elasticsearch 做出診斷報告**。

> 本專案以原 `Azeroth-Kanban`(個人 Kanban 看板,面試作業)為**骨架**:保留其 auth / RBAC / 稽核 /
> i18n / Docker 部署等基礎建設,移除看板功能,改建 Selkie 事故管理。

---

## 架構

npm workspaces monorepo:

| workspace | 套件 | 說明 |
|---|---|---|
| `common/` | `@azeroth/common` | 共用型別(ApiResult / 錯誤碼) |
| `selkie/` | `@azeroth/selkie` | **Selkie agent 核心** —— deepagents + Gemini(Node,ESM) |
| `admin/` | `@azeroth/admin` | Next.js 16 app(App Router)+ Prisma + NextAuth |

獨立元件(非 workspace,各自有 Dockerfile):

| 目錄 | 說明 |
|---|---|
| `sim-service/` | 模擬微服務(Next.js)—— 單一映像,以不同 env 跑成 5 個服務實例,可被注入故障 |
| `simulator/` | 混沌驅動器(Node)—— 產生流量、排程注入故障、發告警給 Selkie |
| `elk/` | Filebeat 設定 —— 收集容器日誌進 Elasticsearch |

### docker compose 拓撲(12 容器)

```
┌─ 基礎 ───────────────┐  ┌─ ELK ─────────────────┐  ┌─ 模擬微服務 (1 映像 ×5 實例) ─────────┐
│ postgres             │  │ elasticsearch (:9200) │  │ sim-checkout    sim-payments         │
│ keycloak  (:8080)    │  │ kibana        (:5601) │  │ sim-cart        sim-orders           │
│ admin  Selkie(:3010) │  │ filebeat              │  │ sim-inventory                        │
└──────────────────────┘  └───────────────────────┘  └──────────────────────────────────────┘
                                                      ┌─ 驅動 ────────────────────────────────┐
                                                      │ simulator(流量 + 混沌 + 告警)        │
                                                      └───────────────────────────────────────┘
```

### 事故流程(全真實)

```
simulator ──注入故障──► sim-service ──產生真實錯誤日誌──► filebeat ──► Elasticsearch (selkie-logs-*)
    │                                                                          ▲
    └──POST 告警 (x-selkie-webhook-secret)──► admin /api/v1/webhooks/alerts/generic
                                                  │                            │
                                            建立 Incident                       │
                                                  └──自動 startTriage──► Selkie agent ──query_logs/metrics──┘
                                                                              │
                                                                  寫回 AgentRun ──► 事故詳情頁渲染診斷報告
```

Selkie agent 內部:主 orchestrator 用 `write_todos` 規劃,委派 log / metrics / deploy / runbook
四個 subagent 深度調查,於虛擬檔案系統彙整 `incident-report.md`。**唯讀** —— 只調查與建議,不改動基礎設施。

`TOOL_BACKEND=real` 時,`query_logs` / `query_metrics` 查的是**真實的 Elasticsearch**;
`list_recent_deploys` / `get_pull_request` / `search_past_incidents` 為對齊模擬情境的環境 metadata。

---

## 快速開始

### A. 擬真環境一鍵啟動(Docker,推薦)

需要 Docker Desktop,建議配置 **≥ 6GB** 記憶體(ELK + 5 個 Next 實例 + 既有 3 容器)。

```bash
cp .env.example .env           # 至少改 AUTH_SECRET
docker compose up -d --build   # 建置並啟動 12 個容器
docker compose logs admin -f   # 看到 [entrypoint] seed: ✅ success 即代表 admin 就緒
```

啟動後:

| 服務 | 網址 | 說明 |
|---|---|---|
| Selkie 事故管理 | http://localhost:3010 | 主應用(下方預設帳號登入) |
| Kibana | http://localhost:5601 | 瀏覽 ELK 收集到的真實日誌 |
| Elasticsearch | http://localhost:9200 | 日誌索引 `selkie-logs-*` |

啟動約 **2~3 分鐘**後,`simulator` 開始輪流對 sim 服務注入故障。觀察:

```bash
docker compose logs -f simulator   # 看注入了哪個故障、何時發告警
```

每注入一次故障,事故看板(`/incidents`)會自動冒出一筆新事故,Selkie 隨即自動 triage。

### B. 本機開發(輕量,mock 後端)

```bash
docker compose up -d postgres        # 只起 DB
npm install
cp .env.example .env                 # 改 AUTH_SECRET;DATABASE_URL 指向 localhost:5444
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev                          # common + selkie 先 build,再起 admin(:3011)
```

本機開發預設 `TOOL_BACKEND=mock`(內建假資料,免 ELK)。

### 預設帳號

| Email | 密碼 | 角色 | 事故權限 |
|---|---|---|---|
| `admin@example.com` | `Admin@1234` | admin | 全部(含檢視所有人的事故) |
| `user@example.com` | `User@1234` | user | 建立 / 編輯 / 觸發調查 / 追問(自己的事故) |
| `viewer@example.com` | `Viewer@1234` | viewer | 唯讀 |

seed 會建立兩筆範例事故 **INC-1024 / INC-1025**;`simulator` 之後注入的故障會再產生
webhook 事故(INC-2xxx),全部都能端到端跑 triage。

---

## 模擬情境(simulator 注入的故障)

`simulator` 輪流對 5 個服務注入對齊情境的故障模式,各自對應一個合理的「肇因 PR」:

| 服務 | 故障模式 | 真實效果 | 對齊的肇因 |
|---|---|---|---|
| `checkout-api` | memory-leak | 持續配置記憶體不釋放 → RSS 攀升 → OOM | PR #482 無上限快取 |
| `payments-api` | error-5xx | 背景作業/請求拋未處理例外 → HTTP 500 | PR #310 未處理錯誤路徑 |
| `cart-service` | slow | 回應延遲飆升 → p99 超標 | PR #205 同步下游呼叫 |
| `order-service` | cpu-spin | 忙迴圈佔滿 CPU → event loop 阻塞 | PR #612 O(n²) 演算法 |
| `inventory-service` | crash | 啟動即 `process.exit(1)` → crashloop | PR #88 SDK 初始化拋錯 |

故障模式持久化到容器內檔案,故 `crash` 在容器重啟後仍生效 —— 形成真實的 crashloop。

---

## 啟用 Selkie 推理(Gemini on Vertex AI)

Selkie 的 triage 需要 Google Vertex AI:

1. GCP 專案啟用 **Vertex AI API**。
2. `.env` 填入 `GOOGLE_CLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION`。
3. 憑證:
   - **Docker**:把 service account JSON 放專案根目錄命名 `service-account.json`,
     取消 `docker-compose.yml` 中 admin 服務的 `volumes` 註解。
   - **本機開發**:`gcloud auth application-default login`,或設 `GOOGLE_APPLICATION_CREDENTIALS`。

未設定時,事故仍會建立、告警 webhook 仍會運作,僅 triage 的 `AgentRun` 會以 **FAILED** 呈現
並顯示缺少 GCP 設定的訊息。

> ⚠️ Gemini 模型預設 `gemini-2.5-pro` / `gemini-2.5-flash`,可由 `.env` 的 `GEMINI_MODEL` /
> `GEMINI_MODEL_FAST` 調整為你所在區域可用的版本。

---

## 主要頁面與 API

| 路徑 | 內容 |
|---|---|
| `/login` | 登入 |
| `/incidents` | 事故列表(新增事故、查看 triage 狀態) |
| `/incidents/[id]` | 事故詳情:metadata、改狀態、**「讓 Selkie 調查」**、triage 報告、**追問 Selkie** 對話面板 |
| `/roles` `/user-roles` | RBAC 角色 / 權限管理(admin) |
| `/audit-logs` `/login-records` | 稽核 / 登入紀錄(admin) |

| API | 說明 |
|---|---|
| `POST /api/v1/webhooks/alerts/[source]` | 告警接收 webhook(共用密鑰驗證)→ 建立事故 → 自動 triage |
| `GET/POST /api/v1/incidents/[id]/chat` | 事故對話面板:triage 後可追問 Selkie |
| `POST /api/v1/incidents/[id]/triage` | 手動觸發一次 Selkie 調查 |

---

## 開發指令

```bash
npm run dev                  # 開發(admin :3011)
npm run build                # build 全部 workspace
npm run type:check           # 全 workspace 型別檢查
npm test --workspace=selkie  # Selkie agent 單元測試
npm run prisma:studio        # 檢視資料庫
docker compose down -v       # 重置(清掉 DB / ES 資料)
```

> 重置整個擬真環境:`docker compose down -v && docker compose up -d --build`。

---

## 技術選型

| 項目 | 選用 |
|---|---|
| 前端 / 後端 | Next.js 16 App Router + React 19 + TypeScript 5.8 |
| AI agent | LangChain **Deep Agents**(`deepagents`)+ LangGraph |
| LLM | Google **Gemini**(透過 **Vertex AI**) |
| 資料庫 / ORM | PostgreSQL 16 + Prisma 6 |
| 認證 / 權限 | NextAuth v5 + 自製 RBAC(角色 / 權限 / 稽核) |
| 日誌 / 可觀測性 | Elasticsearch + Kibana + Filebeat(ELK) |
| 樣式 | Tailwind CSS 3 + RizzUI |
| 報告渲染 | react-markdown |
| 部署 | Docker Compose(12 容器) |

---

## 參考來源 / References

- LangChain Deep Agents(Node)— https://github.com/langchain-ai/deepagentsjs ・ https://docs.langchain.com/oss/javascript/deepagents/overview
- ChatVertexAI — https://docs.langchain.com/oss/javascript/integrations/chat/google_vertex_ai
- Next.js `serverExternalPackages` — https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
- Filebeat container input — https://www.elastic.co/guide/en/beats/filebeat/current/filebeat-input-container.html
- Oncall / SRE agent 設計參考:Claude Cookbook SRE incident responder、OpenSRE(github.com/Tracer-Cloud/opensre)、PagerDuty / Datadog Bits AI SRE
