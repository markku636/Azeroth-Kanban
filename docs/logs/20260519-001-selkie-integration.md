# 執行紀錄 — Selkie 事故 Agent 整合

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-05-19 |
| 範圍 | 移除 Kanban、在骨架上建立 Selkie 事故調查 agent |
| 關聯 | PRD `docs/requirements/completed/20260519-001-selkie-incident-agent.md` |

---

## 1. 概要

把先前獨立的 deepagents oncall agent(`C:\Project\oncall-agent`)整合進 `Azeroth-Kanban`
骨架:移除 Kanban 領域功能,保留基礎建設,新增 `@azeroth/selkie` workspace 與事故管理 UI。

---

## 2. 階段時間軸

| 階段 | 內容 | 結果 |
| --- | --- | --- |
| Phase 0 | 移除 Kanban(頁面 / API / service / Prisma model / 權限 / 選單 / 錯誤碼) | ✅ |
| Phase 1 | 新增 `selkie/` workspace,移植 agent 核心;runbook 改內嵌常數 | ✅ |
| Phase 2 | Prisma `Incident` / `AgentRun` 模型 + enum、重整 migration 為 `init_selkie`、`incidents.*` 權限、seed 範例事故 | ✅ |
| Phase 3 | `incident-service` / `selkie-service`(背景 triage)+ 5 支 API 路由 | ✅ |
| Phase 4 | `next.config.js` `serverExternalPackages`、admin 加 `@azeroth/selkie` + `react-markdown` | ✅ |
| Phase 5 | 事故列表頁、詳情頁(觸發 Selkie、輪詢、markdown 報告)、選單 | ✅ |
| Phase 6 | Dockerfile / docker-compose / `.env.example` / README、PRD、本紀錄 | ✅ |

---

## 3. 關鍵技術決策

- **移除 vs 改造看板**:依使用者指示完整移除 Kanban 領域功能,只保留 auth / RBAC / 稽核 / i18n / UI 元件 / Docker 基礎架構;Selkie 以全新的「事故列表 + 詳情頁」呈現(非拖拉看板)。
- **selkie 為獨立 workspace**:`@azeroth/selkie` 以 ESM 套件形式存在,admin 以 `@azeroth/selkie` 依賴 import;`next.config.js` 用 `serverExternalPackages` 把 agent 與 LangChain 標記為 server-only。
- **背景 triage**:triage 耗時 1–3 分鐘,API 立即建 `AgentRun(QUEUED)` 並回應,實際調查在 standalone Next.js node server 行程內背景續跑,前端輪詢。
- **migration 重整**:因專案方向轉變,把舊的 kanban migration 重整為單一 `20260519000000_init_selkie`(用 `prisma migrate diff --from-empty` 離線產生)。

---

## 4. Bug Log

### Bug #1:`next build` 失敗 — selkie 的 knowledge 路徑在打包後失效

| 分類 | 內容 |
| --- | --- |
| **[Bug]** | `next build` 在 `selkie/dist/knowledgeBase.js` 報 `Module not found: Can't resolve '../knowledge'`。 |
| **[Root Cause]** | `@azeroth/selkie` 為 workspace 套件,會被 Next.js / Turbopack 打包;`knowledgeBase.ts` 用 `new URL("../knowledge", import.meta.url)` 讀檔案系統的 runbook 目錄,打包後該相對路徑失效。(且 `.dockerignore` 排除 `*.md`,Docker 內也讀不到。) |
| **[Solution]** | 把 4 篇 runbook + 嚴重度規範 + 升級政策改為內嵌 TS 字串常數(`selkie/src/knowledge-data.ts`),`knowledgeBase.ts` 不再讀檔案系統。 |
| **[Prevention]** | 會被打包進 Next.js 的套件,不可依賴 `import.meta.url` / `fs` 讀相鄰檔案;資料應內嵌為程式碼或經 API 取得。 |

### Bug #2:Docker 建置失敗 — selkie 的 tsc 找不到 deepagents 等模組

| 分類 | 內容 |
| --- | --- |
| **[Bug]** | `docker compose build` 在 `npm run build --workspace=selkie` 報 `TS2307: Cannot find module 'deepagents' / '@langchain/langgraph' / '@langchain/mcp-adapters'`(本機建置正常)。 |
| **[Root Cause]** | selkie 需 `zod@4`、admin 需 `zod@3`,npm workspaces 因版本衝突把 selkie 專屬套件「巢狀」安裝到 `selkie/node_modules`;原 Dockerfile 的 `deps` stage 產生了巢狀 node_modules,但 `builder` 只 `COPY --from=deps /app/node_modules`(僅 root),巢狀套件遺漏。 |
| **[Solution]** | 重構 Dockerfile:`npm ci` 直接在 `builder` stage 內執行,讓 root 與各 workspace 巢狀 `node_modules` 都齊全;runner 另 `COPY --from=builder /app/selkie`(含巢狀 node_modules)。 |
| **[Prevention]** | monorepo 有套件版本衝突時,建置階段必須持有完整的(root + 巢狀)node_modules;不要只複製 root。 |

### Bug #3:Docker 容器啟動失敗 — entrypoint.sh 為 CRLF 換行

| 分類 | 內容 |
| --- | --- |
| **[Bug]** | admin 容器 crash-loop,日誌:`entrypoint.sh: set: line 9: illegal option -`。 |
| **[Root Cause]** | Windows git checkout(`core.autocrlf`)把 `admin/entrypoint.sh` 轉成 CRLF,Linux 容器 `/bin/sh` 無法解析行尾 `\r`。 |
| **[Solution]** | Dockerfile 在 `chmod` 前加 `sed -i 's/\r$//'` 去 CRLF;另加 `.gitattributes`(`*.sh text eol=lf`)防重現。 |
| **[Prevention]** | shell script 一律 LF 換行;跨平台專案以 `.gitattributes` 強制。 |

---

## 5. 驗證結果

- ✅ `tsc --noEmit` — common / selkie / admin 全 workspace 型別檢查通過。
- ✅ `npm run build --workspace=selkie` — selkie 套件建置成功。
- ✅ `npm test --workspace=selkie` — 18 個單元測試全數通過。
- ✅ `next build`(admin)— 24 條路由全數建置成功(含 `/incidents`、`/incidents/[id]`、`/api/v1/incidents/*`、`/api/v1/agent-runs/[id]`)。
- ✅ Docker 建置 — 修正 Bug #2 / #3 後成功。
- ✅ Docker 容器啟動 — postgres / keycloak / admin 三容器皆 Up;`migrate deploy` 套用 `init_selkie`,`db seed` 建立 16 權限 + 3 帳號 + 2 範例事故。
- ✅ 端到端 API 驗證(`.tmp/verify-selkie.sh` 對執行中容器)— 12 / 12 通過:登入、事故列表(含 seed 事故)、建立 / 取得 / 更新、必填驗證、觸發 triage、agent-runs 輪詢、RBAC(viewer 403)。
- ⓘ Selkie 實際 triage — AgentRun 如期 `FAILED` 並回報「service-account.json 不存在」,確認背景任務與錯誤處理正常;LLM 調查需掛載 GCP 憑證。
- ⚠️ 瀏覽器 MCP(chrome-devtools / Claude in Chrome)此環境未連線,改以對執行中容器的 curl API 驗證替代。

---

## 6. 已知限制

- Selkie 實際 triage 需 GCP Vertex AI 憑證;未設定時 app 正常,triage 以 `FAILED` 呈現並顯示設定缺漏訊息。
- 背景 triage 為單機作法(`MemorySaver` 行程內記憶);水平擴展需改 worker + queue + 持久化 checkpointer。
- 事故頁 UI 字串為繁中硬編碼(未進 i18n 字典)。
- 對話面板、告警 webhook 自動建事故列為後續迭代(PRD § 8)。
