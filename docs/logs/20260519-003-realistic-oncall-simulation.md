# 驗證報告 — Selkie 擬真 oncall 模擬環境

| 項目 | 內容 |
| --- | --- |
| 日期 | 2026-05-19 |
| 對象 | `docker compose` 全棧(12 容器) |
| 方法 | 全新啟動 + 端到端 API 驗證 + ELK 資料查證 + 混沌注入實測 |
| 關聯 Plan | `oncall-agent-generic-fern`(擬真 oncall 模擬計劃 — 真實 Next 服務 + ELK) |

---

## 1. 目標

把原本「讀程式內假資料」做 triage 的 Selkie,升級為調查**真實環境**:
實際在 Docker 跑的迷你 production —— 微服務真的故障、產生真的日誌、真的 ELK 收集、
Selkie 查真實 Elasticsearch。

## 2. 交付內容(Phase A–F)

| Phase | 內容 |
| --- | --- |
| A | ELK stack:`elasticsearch` / `kibana` / `filebeat`(`elk/filebeat.yml`) |
| B | 模擬微服務 `sim-service/`(Next.js,單映像 ×5 實例,5 種故障模式) |
| C | `simulator/`(產生流量 + 排程注入故障 + 發告警給 Selkie webhook) |
| D | Selkie 真實後端 `selkie/src/tools/backends/real.ts`(查真實 Elasticsearch) |
| E | 告警 webhook `/api/v1/webhooks/alerts/[source]` + 事故詳情頁「追問 Selkie」對話面板 |
| F | `docker-compose.yml` 組裝 12 容器、env、healthcheck、`README.md`、端到端驗證 |

新增資料模型:`AgentMessage`(對話訊息)+ migration `20260519010000_add_agent_messages`。

## 3. 執行環境 — 12 容器全數 Up

`docker compose down -v && docker compose up -d --build` 全新啟動:

| 群組 | 容器 | 狀態 |
| --- | --- | --- |
| 基礎 | kanban-postgres / kanban-keycloak / kanban-admin | Up(healthy) |
| ELK | selkie-elasticsearch / selkie-kibana | Up(healthy) |
| ELK | selkie-filebeat | Up |
| 微服務 | sim-checkout / sim-payments / sim-cart / sim-orders / sim-inventory | Up(healthy) |
| 驅動 | selkie-simulator | Up |

DB 套用 2 個 migration(`init_selkie` + `add_agent_messages`)、seed 完成。

## 4. 端到端 API 驗證 — 16 / 16 通過

`.tmp/verify-selkie.sh`(curl 對 `http://localhost:3010`):

登入 / 事故 CRUD / 必填驗證 / 觸發 triage / AgentRun 輪詢 / RBAC(viewer 403)
皆通過;Phase E 新增:

| # | 項目 | 結果 |
| --- | --- | --- |
| T7 | 告警 webhook 建立事故 | ✅ |
| T7b | 錯誤 webhook 密鑰 → HTTP 401 | ✅ |
| T8 | 事故對話面板 GET 訊息列表 | ✅ |
| T8 | 未完成 triage 前追問被婉拒 | ✅ |

## 5. 擬真事故流程 — 實測通過

`simulator` 自動輪流注入故障,實測觀察到完整鏈路:

```
14:58 注入 memory-leak 於 checkout-api
14:59 alert posted for checkout-api → HTTP 200   ← webhook 收到
15:01 healing checkout-api
15:02 注入 error-5xx 於 payments-api → HTTP 200
...
```

- **真實日誌進 ES**:`selkie-logs-2026.05.19` 索引,2600+ 筆,可依
  `service.keyword` / `level.keyword` / `route.keyword` / `@timestamp` 查詢。
- **混沌產生真實錯誤日誌**:注入 memory-leak 後,背景作業 tick 每 5s 輸出
  `WARN "memory usage climbing steadily"`,`leakMb` 隨時間遞增(16→86),已進 ES。
- **webhook 自動建事故**:simulator 的告警建立了 INC-2002(checkout-api,SEV2)、
  INC-2003(payments-api,SEV1)—— 嚴重度由告警 severity 正確對應。

## 6. 過程踩坑與修正

| 問題 | 根因 | 修正 |
| --- | --- | --- |
| 多個 sim 服務並行 build 同一 image tag 衝突 | compose 並行 build 同名 image | 只 `sim-checkout` 帶 `build`,其餘共用 `image:` |
| sim-service 日誌全被 ES 退件(status=400) | filebeat ECS 範本把 `service` 對應成物件,與字串欄位衝突 | `setup.template.enabled: false`,改 ES 動態 mapping;只收 `sim-*` 容器 |
| 注入故障後背景 tick 仍記錄 INFO(看不到故障) | Next.js standalone 把 instrumentation / 各 route 各自打包,`chaos.ts` 記憶體變數不共用 | `getMode()` 改為每次讀持久化檔案(單一真實來源) |

## 7. 已知限制

Selkie 實際 LLM 調查需 GCP Vertex 憑證(`service-account.json`)。
未掛載時:事故仍建立、webhook 仍運作、ELK 仍收集真實日誌,僅 triage 的
`AgentRun` 呈現 `FAILED`(明確錯誤訊息)。掛載憑證後,Selkie 即會查
真實 Elasticsearch 完成端到端調查。屬環境設定,非程式問題。

## 8. 結論

擬真 oncall 模擬環境**建置並驗證完成**:12 容器全棧、真實微服務故障、
真實 ELK 日誌收集、webhook 自動建事故、對話面板 —— 端到端 16/16 通過,
混沌注入與日誌鏈路實測無誤。
