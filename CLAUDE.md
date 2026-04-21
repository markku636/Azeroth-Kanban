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
