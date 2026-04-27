# Azeroth Kanban

個人 Kanban 看板系統（4 欄式 + 拖拉 + RBAC + i18n）

## 實作過程記錄
https://github.com/markku636/Azeroth-Kanban/blob/main/thinking-roadmap/index.md

## 本地運行
1. docker compose up -d
2. 訪問 http://localhost:3010/

## 佈署到自己家的K8S，需要開機才訪問的到
https://azeroth-kanban.markkulab.net/admin/kanban 


## 功能總覽
- **四欄看板**：待處理 / 進行中 / 待驗收 / 已完成
- **卡片 CRUD**：頁面頂端 inline 表單新增、Modal 編輯（含 emoji 狀態下拉）、卡片 hover 浮現編輯 / 刪除 icon
- **拖拉同步**：跨欄與欄內排序，後端 sortOrder 演算法（整數 + 中位數 + normalize）
- **RBAC 權限**：admin / user / viewer 三角色，Role-Permission 可在 UI 即時調整
- **跨使用者隔離**：每個使用者只能看 / 改自己的卡片（admin 也是）
- **i18n**：zh-TW / en 雙語，含 API 錯誤碼翻譯（`ApiErrorCode` 雙碼制）
- **RWD**：< lg 看板改水平捲動 + snap、Modal 手機版 bottom-sheet、TouchSensor 長按啟動拖拉
- **稽核**：登入紀錄與操作紀錄頁可查
- **一鍵啟動**：`docker compose up -d` 同時起 postgres + admin（自動 migrate + seed）

## 技術選型

| 項目 | 選用 | 理由 |
| --- | --- | --- |
| 語言 | TypeScript 5.8（strict mode） | 全面型別安全 |
| 前端 | Next.js 15 App Router + React 19 | SSR + RSC，單一專案前後端 |
| 樣式 | Tailwind CSS 3 + RizzUI 1.0 | 快速刻 UI、設計一致性 |
| 深色模式 | next-themes | 系統偏好偵測 + 切換持久化 |
| 後端 | Next.js Route Handlers | 單一 runtime 維護 |
| 資料庫 | PostgreSQL 16 | Docker 啟動即可 |
| ORM | Prisma 6 | 型別安全、migration / seed 內建 |
| 認證 | NextAuth v5 + bcryptjs | Credentials provider 主流程；保留 Keycloak provider 供未來擴充 |
| 表單 | react-hook-form + Zod | 受控表單 + schema 驗證 |
| 狀態管理 | Jotai | 原子化 store、低樣板 |
| 表格 | TanStack Table v8 + rc-table | 角色 / 稽核 / 登入紀錄列表 |
| 拖拉 | @dnd-kit (core / sortable / utilities) | React 19 相容、Pointer / Touch / Keyboard 三 sensor |
| Toast | react-hot-toast | 輕量、簡單 API |
| i18n | 自製 useTranslation hook + JSON 字典 | 支援巢狀 key + `{{var}}` 插值，無 next-intl 重構成本 |
| 部署 | Docker Compose（一鍵）+ Helm chart（K8s） | 本機與正式環境皆覆蓋 |

## 安裝與啟動

### A. 一鍵啟動（推薦）

需要 Docker Desktop。

```bash
docker compose up -d
docker compose logs admin -f      # 看到 [entrypoint] seed: ✅ success 即可
```

打開 http://localhost:3010 → 自動 redirect 到 `/login`。

容器啟動時會自動：
1. 等 postgres healthy
2. `prisma migrate deploy` 套用 schema
3. `prisma db seed` 建立 3 個角色 + 14 個權限 + role-permission 矩陣 + 3 預設帳號（idempotent，多次啟動安全）
4. 啟動 Next.js

### B. 本機 dev

```bash
# 1. 起 postgres（docker）
docker compose up -d postgres

# 2. 安裝依賴
npm install

# 3. 建立 .env（複製 .env.example 修改）
cp .env.example .env
# 至少修改 AUTH_SECRET

# 4. 初始化 DB
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed

# 5. 啟動 dev server（port 3010）
npm run dev
```

## 預設帳號

`prisma db seed` 會建立以下三個帳號（bcrypt 雜湊密碼）：

| Email | 密碼 | Role | 可做什麼 |
| --- | --- | --- | --- |
| `admin@example.com` | `Admin@1234` | admin | 全部 14 個權限（Kanban + 角色 / 權限 / 稽核管理） |
| `user@example.com` | `User@1234` | user | Kanban 看板 CRUD（自己的卡片） |
| `viewer@example.com` | `Viewer@1234` | viewer | Kanban 看板唯讀（只能看自己的卡片） |

> 三個角色的 Kanban 視圖一律以 `ownerId = session.userId` 過濾，admin 也只看得到自己的卡片。跨使用者管理需求不在面試作業範圍內。

## 主要頁面

| 路徑 | 內容 |
| --- | --- |
| `/login` | 帳密登入頁 |
| `/` | Dashboard 入口（登入後自動導向 `/kanban`） |
| `/kanban` | Kanban 看板（4 欄 + 拖拉 + inline 新增 + 編輯 Modal） |
| `/me` | 個人資訊 |
| `/roles` | 角色管理 + Role-Permission 勾選 Modal（admin 限定） |
| `/user-roles` | 使用者-角色指派（admin 限定） |
| `/audit-logs` | 操作稽核紀錄（admin 限定） |
| `/login-records` | 登入紀錄（admin 限定） |

## 專案結構

```
├── common/                          # 共用型別（@azeroth/common）
│   └── src/
│       ├── api-response.ts          # ApiResult / ApiResponse
│       ├── api-error-code.ts        # 結構化錯誤碼字典
│       └── index.ts                 # barrel export
├── admin/                           # Next.js 15 後台
│   ├── src/
│   │   ├── app/
│   │   │   ├── admin/
│   │   │   │   ├── login/
│   │   │   │   └── (dashboard)/
│   │   │   │       ├── kanban/      # ← Kanban 頁（page.tsx + _components / _lib）
│   │   │   │       ├── me/
│   │   │   │       ├── roles/
│   │   │   │       ├── user-roles/
│   │   │   │       ├── audit-logs/
│   │   │   │       └── login-records/
│   │   │   └── api/v1/
│   │   │       ├── kanban/cards/    # ← Kanban CRUD + move API
│   │   │       └── admin/           # users / roles / permissions / me / audit-logs / login-records
│   │   ├── auth.ts                  # NextAuth 設定
│   │   ├── middleware.ts            # 路由守衛（NextAuth）
│   │   ├── lib/
│   │   │   ├── api-client.ts        # 前端 fetch 封裝
│   │   │   ├── api-response.ts      # ApiResult helpers
│   │   │   ├── kanban-service.ts    # sortOrder 演算法、ownerId 過濾
│   │   │   ├── permission-service.ts
│   │   │   ├── audit-log-service.ts
│   │   │   ├── translate-api-error.ts
│   │   │   ├── validators.ts        # Zod schemas
│   │   │   ├── with-permission.ts   # API 權限裝飾器
│   │   │   └── prisma.ts
│   │   ├── components/              # 共用 UI 元件 + icons
│   │   ├── layouts/hydrogen/        # Admin Portal Layout
│   │   ├── hooks/                   # use-media / use-window-scroll …
│   │   ├── utils/                   # class-names / hex-to-rgb …
│   │   ├── config/
│   │   ├── types/
│   │   └── locales/                 # zh-TW.json / en.json
│   ├── Dockerfile
│   └── entrypoint.sh                # 等 DB → migrate → seed → start Next.js
├── prisma/
│   ├── schema.prisma                # Member / Role / Permission / RolePermission / KanbanCard / AuditLog / LoginRecord
│   ├── migrations/                  # 已 checked in 的 migration SQL
│   └── seed.ts                      # 3 roles + 14 permissions + matrix + 3 members
├── helm/                            # Kubernetes Helm chart（Chart.yaml / values.yaml / templates）
├── keycloak/                        # （optional）Keycloak realm export，預設不啟用
├── docs/                            # PRD / Plan / Spec / Bug / Log / Knowledge
├── .claude/                         # Claude Code commands / agents / hooks / rules / skills
└── docker-compose.yml
```

## 常用指令

```bash
# 開發
npm run dev                  # admin port 3010
docker compose up -d         # 一鍵啟動（postgres + admin）
docker compose logs admin -f
docker compose down -v       # 重置（會清掉 postgres data）

# Prisma
npm run prisma:generate
npm run prisma:migrate       # dev migrate
npm run prisma:seed
npm run prisma:reset         # 重置 + seed
npm run prisma:studio

# 品質
npm run type:check
npm run lint
npm run build
```

## QA 自動驗收（`/qa-kanban`）

本專案內建一個 Claude Code subagent — `qa-kanban`，由 [.claude/agents/qa-kanban.md](.claude/agents/qa-kanban.md) 定義，會用 [chrome-devtools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) 開實際瀏覽器跑端對端 UI 驗收，依 PRD 的 AC 逐條驗、產出帶截圖的 Markdown 報告。

### 觸發方式

在 Claude Code 對話中輸入：

```
/qa-kanban smoke              # 1 分鐘 smoke（T1 登入 + 看板顯示）
/qa-kanban all                # 完整跑 7 個 tier（約 10–15 分鐘）
/qa-kanban tier=2,3           # 只驗 CRUD 與拖拉
/qa-kanban AC 4.3             # 只驗單條 AC（除錯用）
```

### Tier 對照（共 7 組）

| Tier | 主題 | 涵蓋 PRD AC |
| --- | --- | --- |
| T1 | Smoke：登入 + 看板顯示 | US-6 AC 6.1–6.2、US-2 AC 2.1–2.2 |
| T2 | 卡片 CRUD | US-1、US-3、US-5 |
| T3 | 拖拉（跨欄、同欄、optimistic UI、KeyboardSensor） | US-4 AC 4.1–4.7 |
| T4 | RBAC + ownership 隔離（admin / user / viewer） | PRD § 3.2、AC 6.3 |
| T5 | 輸入驗證 + `ApiErrorCode` 翻譯 | AC 1.2 / AC 3.x / AC 10.5 |
| T6 | i18n 多語系（zh-TW ↔ en） | US-10 AC 10.1–10.5 |
| T7 | RWD 響應式（1280 / 768 / 375 三斷點截圖） | US-7 AC 7.1–7.5 |

### 前置條件

- 應用必須**已在 `http://localhost:3010` 跑**（`docker compose up -d` 即可）
- `.mcp.json` 已配置 chrome-devtools MCP（專案內建）
- subagent 連不到服務會立即寫一份「服務未啟動」報告後結束，不會自動啟動 docker

### 產出位置

- 報告：`.tmp/qa-reports/{YYYYMMDD-HHmm}/report.md`（增量寫入，避免中途失敗丟失進度）
- 截圖：`.tmp/qa-reports/{YYYYMMDD-HHmm}/screenshots/T{n}-{ac}-{step}.png`
- 失敗證據檔名以 `-FAIL` 結尾，方便快速定位

> `.tmp/` 已在 `.gitignore`，不會污染 git 工作樹。

### 安全邊界

subagent 的工具白名單嚴格限定 chrome-devtools MCP + Read / Write / Edit / Bash，**禁止修改任何 `admin/` / `prisma/` / `common/` 下的業務程式碼**；Bash 也只用於 `curl` 探活與 `mkdir` 建報告資料夾。設計細節見 [.claude/agents/qa-kanban.md](.claude/agents/qa-kanban.md) 與 [.claude/commands/qa-kanban.md](.claude/commands/qa-kanban.md)。

## 環境變數

完整清單見 `.env.example`。最常調整的：

| Key | 預設 | 說明 |
| --- | --- | --- |
| `DATABASE_URL` | postgres://kanban:.../kanban | postgres 連線字串 |
| `AUTH_SECRET` | 必須改 | NextAuth session 加密金鑰，至少 32 字 |
| `AUTH_ALLOW_CREDENTIALS` | `true` | 是否啟用 Credentials provider |
| `NEXT_PUBLIC_AUTH_KEYCLOAK_ENABLED` | `false` | 登入頁是否顯示 Keycloak 按鈕（要顯示需配合 `AUTH_KEYCLOAK_*` 三個 env） |
| `SEED_ON_START` | `true` | docker entrypoint 是否每次啟動時跑 seed（upsert，安全） |

## AI 協作紀錄

本專案完整經歷「Write-doc-before-Code」流程：

- **PRD**：`docs/requirements/completed/20260423-001-kanban-board.md`（v0.4，已透過 chrome-devtools MCP 從 demo 影片擷取 12 張幀對齊 UX）
- **Plan**：`docs/plans/doing/20260423-001-kanban-board.md`（系統分析、架構圖、ER 圖、WBS、4 份 Spec 拆解）
- **Spec A–D**：依序開發 Keycloak / DB / docker → Kanban core → RWD / 觸控 → i18n 錯誤碼翻譯，皆有完整 AI 協作紀錄與決策記錄

詳細歷程見 [`docs/`](./docs/) 目錄。
