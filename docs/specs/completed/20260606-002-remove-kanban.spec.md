# 移除 Kanban 看板相關功能

> 建立日期: 2026-06-06
> 狀態: ✅ 已完成
> 類型: 功能移除（cleanup）— 專案已轉型為股票 AI 機器人，Kanban 看板為遺留功能

## 目標

將遺留的 Kanban 看板功能從專案中徹底移除（程式碼 + DB + 依賴 + 歷史文件 + QA 工具），
登入後預設首頁改為股票機器人 console（`/stock-bot/console`）。
保留 Keycloak realm 命名（`kanban`）不動，避免破壞既有認證設定。

## ⚠️ 資料庫異動

本次**有資料庫異動（破壞性）**，受影響資料表：

- **DROP TABLE** `kanban_card`（含資料）
- **DROP TYPE** `CardStatus`（enum）
- 移除 `members` 與 `kanban_card` 的外鍵關聯

以新增 migration `20260606130000_remove_kanban` 處理，不修改既有已套用的 migration。

## 受影響檔案

### 刪除（整檔 / 整目錄移除，經由 shell）

- 目錄 `admin/src/app/(dashboard)/kanban/`（page + _components + _lib）
- 目錄 `admin/src/app/api/v1/kanban/`（cards CRUD + move API）
- `admin/src/lib/kanban-service.ts`
- `admin/src/lib/kanban-permission.ts`
- `.claude/agents/qa-kanban.md`
- `.claude/commands/qa-kanban.md`
- `docs/requirements/completed/20260423-001-kanban-board.md`
- `docs/plans/completed/20260423-001-kanban-board.md`
- `docs/specs/completed/20260425-002-kanban-core.spec.md`
- `docs/specs/completed/20260427-003-kanban-mobile-fullbleed.spec.md`
- `docs/specs/completed/20260429-003-kanban-cross-owner-permissions.spec.md`

### prisma

| 檔案路徑 | 動作 | 說明 |
| --- | --- | --- |
| `prisma/schema.prisma` | 修改 | 移除 `CardStatus` enum、`KanbanCard` model、`Member.kanbanCards` 關聯 |
| `prisma/seed.ts` | 修改 | 移除 7 個 kanban 權限、role matrix 中的 kanban 碼、role 描述文字 |
| `prisma/migrations/20260606130000_remove_kanban/migration.sql` | 新增 | DROP FK / table / enum |

### common

| 檔案路徑 | 動作 | 說明 |
| --- | --- | --- |
| `common/src/api-error-code.ts` | 修改 | 移除 `KANBAN` 錯誤碼群組與 union 成員 |

### admin

| 檔案路徑 | 動作 | 說明 |
| --- | --- | --- |
| `admin/src/config/routes.ts` | 修改 | `dashboard` 改為 `/stock-bot/console`，移除 `kanban` |
| `admin/src/config/permissions.ts` | 修改 | 移除 `KANBAN_*` 權限常數 |
| `admin/src/layouts/hydrogen/menu-items.tsx` | 修改 | 移除 Kanban 選單項與 `PiKanbanDuotone` import |
| `admin/src/middleware.ts` | 修改 | `POST_LOGIN_PATH` 改為 `/stock-bot/console` |
| `admin/src/lib/require-permission.ts` | 修改 | redirect 由 `/kanban` 改為 `/stock-bot/console` |
| `admin/src/lib/audit-log-service.ts` | 修改 | `AuditEntityType` 移除 `'KanbanCard'` |
| `admin/src/app/(dashboard)/page.tsx` | 修改 | redirect 改 `routes.dashboard` |
| `admin/src/app/login/page.tsx` | 修改 | fallback 由 `routes.kanban` 改 `routes.dashboard` |
| `admin/src/app/not-found.tsx` | 修改 | 文字 / alt 由 "Azeroth Kanban" 改為專案名 |
| `admin/src/app/layout.tsx` | 修改 | metadata title / description 改為專案名 |
| `admin/src/lib/validators.ts` | 修改 | 移除註解中的 Kanban 字樣 |
| `admin/src/locales/en.json` | 修改 | 移除 `admin.kanban.*`、menu `kanban`、`errors.kanban.*` |
| `admin/src/locales/zh-TW.json` | 修改 | 同上 |
| `admin/package.json` | 修改 | 移除 `@dnd-kit/*` 三個依賴 |

### 根目錄 / 文件

| 檔案路徑 | 動作 | 說明 |
| --- | --- | --- |
| `package.json` | 修改 | name `azeroth-kanban` → `stock-deep-agent` |
| `CLAUDE.md` | 修改 | 移除 Kanban 描述、`/qa-kanban`、`qa-kanban` agent 參照 |
| `README.md` | 修改 | 移除 Kanban 功能描述與 QA 段落 |

## 不在範圍

- `keycloak/realm-export.json`（realm `kanban`）— 認證 realm 命名，改名會破壞登入設定，保留。
- `.claude/settings.local.json` — 指向另一 repo 的 allowlist，無關本功能。

## 預期測試

- [x] `prisma validate` 通過（schema 無 KanbanCard）
- [x] `npm run type:check` 通過（admin + worker，無殘留 kanban 參照）
- [x] grep `kanban` 於 admin/common/prisma 程式碼無殘留（僅新 drop migration 保留字樣）
- [ ] `prisma migrate deploy` 套用 drop migration（需 DB 連線，待使用者於本機 / 容器執行）
- [ ] `prisma generate` 重新產生 client（本次因 dev/worker 鎖住 query engine DLL 而 EPERM，需停掉再跑）

## 實際變更
<!-- hook -->
## Bug Log
- `prisma/migrations/20260606130000_remove_kanban/migration.sql` — Write @ 2026-06-06 03:21
- `admin/src/app/(dashboard)/page.tsx` — Edit @ 2026-06-06 03:22
- `admin/src/middleware.ts` — Edit @ 2026-06-06 03:22
- `admin/src/lib/require-permission.ts` — Edit @ 2026-06-06 03:22
- `admin/src/lib/audit-log-service.ts` — Edit @ 2026-06-06 03:22
- `admin/src/app/login/page.tsx` — Edit @ 2026-06-06 03:22
- `admin/src/app/not-found.tsx` — Edit @ 2026-06-06 03:22
- `admin/src/app/layout.tsx` — Edit @ 2026-06-06 03:27
- `admin/src/lib/validators.ts` — Edit @ 2026-06-06 03:27
