# Azeroth Kanban — Claude Code 指引

## 專案概述

**Azeroth 面試作業 — Kanban 看板網站**。目前狀態：已從原有業務系統清理出乾淨骨架，保留基本登入與 RBAC，後續將實作 Kanban 核心功能（4 欄狀態、卡片 CRUD、拖拉）。

採用 **Monorepo** 結構，共兩個 workspace：
- **common/** — 共用 `ApiResponse` / `ApiResult` 型別
- **admin/** — Next.js 15 後台（登入、RBAC、稽核）

---

## 目錄結構（目前骨架）

```
Iqt.Affiliation.System/
├── common/src/
│   ├── api-response.ts          ← ApiResult / ApiReturnCode / ApiResponse
│   └── index.ts
├── admin/
│   └── src/
│       ├── app/
│       │   ├── admin/
│       │   │   ├── login/page.tsx        ← 帳密登入頁
│       │   │   └── (dashboard)/
│       │   │       ├── page.tsx           ← 管理首頁
│       │   │       ├── me/                ← 個人資料
│       │   │       ├── roles/             ← 角色管理
│       │   │       ├── user-roles/        ← 使用者角色指派
│       │   │       ├── audit-logs/        ← 稽核紀錄
│       │   │       └── login-records/     ← 登入紀錄
│       │   └── api/
│       │       ├── auth/[...nextauth]/    ← NextAuth Credentials
│       │       └── v1/admin/
│       │           ├── me/
│       │           ├── user/permissions/
│       │           ├── users/             ← 使用者列表 + 角色指派
│       │           ├── roles/
│       │           ├── permissions/
│       │           ├── audit-logs/
│       │           └── login-records/
│       ├── auth.ts                        ← NextAuth 設定（Credentials + bcrypt）
│       ├── middleware.ts                  ← 路由守衛
│       ├── lib/
│       │   ├── prisma.ts
│       │   ├── api-response.ts
│       │   ├── permission-service.ts
│       │   ├── audit-log-service.ts
│       │   └── with-permission.ts         ← API 權限裝飾器
│       ├── components/
│       ├── config/
│       ├── hooks/
│       └── layouts/hydrogen/              ← Admin Portal Layout
├── prisma/
│   ├── schema.prisma                      ← 6 張表：Member / Role / Permission / RolePermission / AuditLog / LoginRecord
│   └── seed.ts                            ← admin / manager / viewer 預設帳號
├── docker-compose.yml                     ← postgres + admin
└── package.json                           ← workspaces: [common, admin]
```

---

## 技術棧

| 項目 | 技術 |
| --- | --- |
| 語言 | TypeScript 5.8（strict mode） |
| Admin 框架 | Next.js 15（App Router）、React 19 |
| 資料庫 | PostgreSQL 16、Prisma 6 ORM |
| 驗證 | NextAuth v5 Credentials + bcryptjs |
| 樣式 | Tailwind CSS 3.4 + RizzUI 1.0 |
| 表單驗證 | react-hook-form + Zod |
| 狀態管理 | Jotai |
| 套件管理 | npm workspaces |

Kanban 實作時預計引入：`@dnd-kit/core`（拖拉）、`@dnd-kit/sortable`（欄內排序）。

---

## 命名慣例

- 檔案：`kebab-case`
- 變數／函式：`camelCase`
- 型別／類別／React 元件：`PascalCase`
- 常數：`UPPER_CASE`
- DB 欄位：`snake_case`（透過 Prisma `@map()` 映射）
- 路徑別名：`@/*` → `admin/src/*`、`@iqt/common` → monorepo 的 `common/`

---

## 回應格式

```ts
interface ApiResult<T> {
  success: boolean;
  code: ApiReturnCode;   // 0 / 400 / 401 / 403 / 404 / 429 / 500
  message: string;
  data?: T;
  timestamp: number;
}
```

Service 層回傳 `ApiResult<T>`，**不拋例外**；API route 直接轉發。

---

## 預設帳號

`prisma/seed.ts` 為空殼（no-op `main()`），不 seed 任何帳號。需登入時請手動於 Member 表插入紀錄（password 為 bcrypt 雜湊），或於 `seed.ts` 補上建立邏輯後執行 `npm run prisma:seed`。

---

## 常用指令

```bash
# 開發
npm run dev                  # 啟動 admin (port 3010)
docker compose up -d postgres

# Prisma
npm run prisma:generate
npm run prisma:migrate       # 建立 migration
npm run prisma:seed
npm run prisma:reset         # 重置 + seed
npm run prisma:studio

# 品質
npm run type:check
npm run lint
npm run build
```

---

## 本地服務

| 服務 | Host Port | Container Port |
| --- | --- | --- |
| PostgreSQL 16 | 5444 | 5432 |
| Admin (Next.js) | 3010 (dev 與 docker 一致) | 3000 |

---

## 下一步：Kanban 功能實作

面試作業 PDF 摘要：
- 四欄位：待處理 / 進行中 / 待驗收 / 已完成
- 卡片 CRUD：新增（預設狀態＝待處理）、編輯標題/描述/狀態
- 拖拉：卡片跨欄移動，後端狀態同步更新

預計新增：
- `KanbanCard` Prisma model（id、title、description、status、sortOrder、createdAt、updatedAt）
- `/admin/kanban` 頁面
- `/api/v1/kanban/cards` CRUD + 狀態更新 API
- @dnd-kit 拖拉整合

---

## 工作流程（Write-doc-before-Code）

所有超過 3 行的程式碼改動，必須先產生對應文件並取得確認：

| 規模 | 判斷條件 | 需要的文件 | Plan 建議章節（大型必填） |
| --- | --- | --- | --- |
| 大型 | 新功能 / 跨多子專案 / 架構變更 | （需求模糊先走 PRD →）Plan → Spec(s) → Log | 系統分析、系統架構（含 Mermaid 圖）、角色與權限、WBS、資料表異動（有異動時） |
| 中型 | 改動 3+ 檔案但範圍明確 | Spec → Log | — |
| 小型 | ≤3 行 / typo / 設定值 / 格式化 | 豁免，直接改 | — |

### PRD 前置判斷（大型需求的可選前哨）

- **PRD 是可選的**：預設可跳過，只在「大型 + 需求模糊 + 使用者未表達豁免 + 無既有 PRD」**全部成立**時才建立
- **PRD 流程**：AI 依口述內容產生初稿至 `docs/requirements/doing/{YYYYMMDD}-{NNN}-{topic}.md` → 🟡 討論中 → 使用者與 AI 逐題迭代 → ✅ 已確認 → SessionEnd Hook 歸檔至 `completed/` → 才建立對應 Plan
- **硬性規則**：PRD **建立後**未標記 ✅ 前，AI 不得建立 Plan；Plan 首段必須引用 `docs/requirements/completed/xxx.md`
- **一對一關係**：1 PRD ↔ 1 Plan。PRD 範圍內若需多階段交付，由 Plan 內的 WBS 與 Spec 清單拆解
- **豁免關鍵字**（使用者任一表達即跳過 PRD）：「不用 PRD」「跳過 PRD」「直接 Plan」「直接做」「不需要文件」「先做個簡單的」「快速做一下」

### 資料庫異動告知規則（硬性）

- AI 在建立 / 更新 Plan 時，若偵測本次任務會**新增 / 修改 / 刪除**任何資料表、欄位、索引、外鍵、約束，**必須**：
  1. 填寫 Plan 的「資料表異動」區塊（含欄位明細 + Migration 注意事項）
  2. 在與使用者確認 Plan 的訊息中，**主動口頭告知「本次有資料庫異動」**，並條列受影響的資料表
- 若無任何 DB schema 變更，Plan 中的「資料表異動」區塊需整段刪除
- 此規則為**硬性規範**，不得因使用者未詢問而省略告知

### 豁免條件（兩層）

- **豁免 PRD（只跳過 PRD）**：中型 / 小型、需求已明確、已有 ✅ PRD、偵測到使用者豁免關鍵字
- **豁免 Plan/Spec（可直接改）**：typo / 版本號 / 設定值 / 格式化 / ≤ 3 行 / 設定檔（`.json` 等）/ 文件檔（`.md`）/ 使用者說「直接改」「hotfix」

### 相關連結

- 完整規則：[`.claude/rules/spec-before-code.md`](./.claude/rules/spec-before-code.md)
- 程式碼慣例：[`.claude/rules/coding-standards.md`](./.claude/rules/coding-standards.md)
- 常用指令：[`.claude/commands/create-spec.md`](./.claude/commands/create-spec.md)（`/create-spec`）
- 文件位置：[`docs/`](./docs/)（`requirements/`、`plans/`、`specs/`、`bugs/`、`logs/`、`knowledge/`、`decisions/`）
- 開發順序（本專案）：`prisma` → `common` → `admin`

PreToolUse Hook 會在 Edit/Write 程式碼檔前檢查是否有 🔵 狀態的 Spec 且其「受影響檔案」包含該路徑，否則會被硬性攔截。SessionEnd 時 Hook 自動將標記 ✅ 的 PRD/Plan/Spec/Bug 歸檔至 `completed/`，並依 manifest 提煉知識至 `docs/knowledge/`（PRD 不提煉）。

---

## Claude Code 設定

### 自訂指令（`.claude/commands/`）

| 指令 | 用途 |
| --- | --- |
| `/create-spec` | 建立 Spec 文件（需求收集 → 查知識庫 → 分析影響 → 建 Spec → 等確認） |
| `/sync-docs` | 掃描專案與 `.claude/` 設定，同步更新 `README.md` 與 `CLAUDE.md`（僅補缺漏、不覆蓋自訂內容） |
| `/sync-skill` | 掃描程式碼與 commands/rules，同步更新 `.claude/skills/` 技能文件 |
| `/qa-kanban` | 觸發 `qa-kanban` subagent 對 Kanban 看板跑端對端驗收（chrome-devtools MCP）；參數可選 `all` / `smoke` / `tier=N,M` / `AC X.Y` |

> `_spec-convention.md` 為 convention 文件（非 slash 指令），由 `/create-spec` 引用。

### Subagents（`.claude/agents/`）

| Subagent | 用途 |
| --- | --- |
| `qa-kanban` | Kanban 看板的端對端 QA 驗收 agent；用 chrome-devtools MCP 依 PRD 的 AC 逐條跑、產出帶截圖的 Markdown 報告至 `.tmp/qa-reports/{YYYYMMDD-HHmm}/`。工具白名單只開 chrome-devtools MCP + Read/Write/Edit/Bash，禁止改業務程式碼。由 `/qa-kanban` 觸發。 |

### 常駐規則（`.claude/rules/`）

| 規則 | 用途 |
| --- | --- |
| `spec-before-code.md` | ⛔ 強制攔截 Edit/Write — 必須先有 🔵 Spec 才能寫程式碼；涵蓋 Plan/Spec/Bug/Log/Knowledge 全生命週期 |
| `coding-standards.md` | 命名、型別、async、React、安全性、錯誤處理（`ApiResult` pattern）等程式碼慣例 |

### 技能模組（`.claude/skills/`）

| 技能 | 用途 |
| --- | --- |
| `multi-project-workflow.md` | 三個子專案（`prisma` → `common` → `admin`）的協作工作流：新增功能／新增資料表／修 Bug／重構／更新文件 |

### Hooks（`.claude/hooks/`）

| Hook | 事件 | 行為 |
| --- | --- | --- |
| `spec-before-code.mjs` | PreToolUse（Edit/Write） | 程式碼檔案必須對應 `docs/specs/doing/` 某個 🔵 Spec 的「受影響檔案」清單，否則攔截 |
| `post-tool-use-spec-tracker.mjs` | PostToolUse | 追蹤被改動的檔案，維護 Spec 進度 |
| `session-start-brief.mjs` | SessionStart | 展示當前 `doing/` 文件摘要 |
| `session-end-archive.mjs` | SessionEnd | 將標記 ✅ 的 Plan/Spec/Bug 從 `doing/` 移至 `completed/` |
| `session-end-knowledge.mjs` | SessionEnd | 依 manifest 提煉知識至 `docs/knowledge/`，維護 `knowledge/INDEX.md` |
