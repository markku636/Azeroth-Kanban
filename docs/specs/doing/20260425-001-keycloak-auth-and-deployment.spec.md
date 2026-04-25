# Spec A: Keycloak SSO + DB Schema + 一鍵啟動部署

> 建立日期: 2026-04-25
> 狀態: 🔵 開發中（v0.5 修訂：Demo 改帳密為主登入、UI 品牌字串改 Azeroth Kanban / AscentisTech）
> 關聯計劃書: `docs/plans/doing/20260423-001-kanban-board.md`

---

## 目標

建立 Kanban 看板的「依賴根基」：

1. **Prisma schema** — 新增 `KanbanCard` model + `CardStatus` enum；改造 `Member` 支援 Keycloak（`password` 改 optional、新增 `keycloak_sub` unique 欄位）
2. **Seed 資料** — 建立 3 個系統角色（admin / user / viewer）、14 個 permissions、role-permission 矩陣，以及 3 個本地保險帳號（bcrypt 密碼，供 Credentials 後備或單機 Demo）
3. **`@iqt/common` ApiErrorCode 常數** — 統一前後端錯誤碼字典（後續 Spec 用於 toast 翻譯）
4. **Keycloak SSO 認證** — NextAuth v5 加入 Keycloak Provider；signIn / jwt callback 自動 upsert Member（以 `keycloak_sub` 為鍵），並依 `realm_access.roles` 同步單一 role
5. **登入頁改造** — 移除帳密欄位，改為「以 Keycloak 登入」按鈕；保留既有 i18n 與佈局
6. **一鍵啟動** — `docker-compose.yml` 新增 keycloak service；`admin/Dockerfile` entrypoint 自動跑 `prisma migrate deploy` + `prisma db seed`；`keycloak/realm-export.json` 含預設使用者
7. **既有 Role-Permission Modal 重用** — `admin/src/app/admin/(dashboard)/roles/page.tsx` 既有 Permission 勾選 Modal 可直接使用，**本 Spec 不改動 UI**，僅補齊 14 個 permissions 的 i18n key

## 背景

PRD § 1 將 Credentials + bcrypt 認證改為 Keycloak OIDC，Plan § 方案概述指定先完成「資料層 + 認證」作為其他 Spec 的依賴根基。本 Spec 同時把「一鍵啟動」打包進來，避免 Spec B 開始實作時還要回頭調整 docker-compose / Dockerfile。

> 參考知識：本專案 `docs/knowledge/` 目前為空。

掃描既有程式碼後確認：
- `common/src/api-response.ts` 已含 `errorCode` 欄位（v0.4 預先擴充），不需再動 `ApiResult` 介面
- `admin/src/app/admin/(dashboard)/roles/page.tsx` 已實作完整 Permission 勾選 Modal（含 group 全選、半選態），**Spec A 不重做 UI**
- `admin/src/hooks/use-translation.ts` 為自製 i18n hook（讀 `locales/zh-TW.json` / `locales/en.json`），Spec D 才會遷移到 next-intl
- `admin/Dockerfile` 已多階段 build，缺 entrypoint 跑 migrate / seed

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ✅ | schema 新增 KanbanCard / CardStatus、Member 加 `keycloak_sub` + password optional；seed 重建 |
| `common` | ✅ | 新增 `api-error-code.ts` 常數字典；`index.ts` 補 export |
| `admin` | ✅ | `auth.ts` 換 Keycloak provider；`login/page.tsx` 改 SSO 按鈕；補 `.env.example`、permissions config 補項；i18n locales 補 key |
| `keycloak/`（新增資料夾） | ✅ | 新增 `realm-export.json`（client + roles + 3 users） |
| 部署層 | ✅ | `docker-compose.yml` 加 keycloak service + healthcheck；`admin/Dockerfile` 加 entrypoint script |

## 建議開發順序

1. **`prisma`** — schema + migration + seed（含 bcrypt 預設密碼）
2. **`common`** — `api-error-code.ts` + index 補 export
3. **`admin`**（依序）：
   - `config/permissions.ts` 補 KANBAN_*、ROLE_PERMISSIONS_*
   - `auth.ts` 換 Keycloak provider
   - `app/admin/login/page.tsx` 改 SSO 按鈕
   - `locales/{zh-TW,en}.json` 補 key
   - `.env.example` 補 Keycloak 變數
4. **部署** — `keycloak/realm-export.json`、`docker-compose.yml`、`admin/Dockerfile` entrypoint 與 `entrypoint.sh`

---

## 受影響檔案

### prisma

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `prisma/schema.prisma` | 修改 | 新增 `KanbanCard` model + `CardStatus` enum；`Member.password` 改 nullable；`Member` 加 `keycloakSub` unique；`Member` 加 `kanbanCards` 反向 relation |
| `prisma/seed.ts` | 修改 | 建立 3 roles、14 permissions、role_permissions 矩陣、3 預設 Members（bcrypt 密碼） |
| `prisma/migrations/{TS}_add_kanban_and_keycloak_support/migration.sql` | 新增 | 由 `prisma migrate dev --name add_kanban_and_keycloak_support` 自動生成 |

### common

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `common/src/api-error-code.ts` | 新增 | `ApiErrorCode` 常數物件，列舉本系統所有錯誤碼 string keys（如 `auth.unauthorized`、`kanban.card_not_found`、`kanban.forbidden_not_owner` 等） |
| `common/src/index.ts` | 修改 | 補 `export * from './api-error-code';` |

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/auth.ts` | 修改 | 加入 Keycloak Provider（`next-auth/providers/keycloak`）；`signIn` callback 解析 `profile.sub` + `realm_access.roles`，upsert Member；`jwt` callback 帶入 `roles`、`memberId`；保留 Credentials provider 作為本地 fallback（受 `AUTH_ALLOW_CREDENTIALS` env 開關控制，預設關閉） |
| `admin/src/app/admin/login/page.tsx` | 修改 | 預設以「帳號密碼」為主登入流程；若 `NEXT_PUBLIC_AUTH_KEYCLOAK_ENABLED=true` 才在下方顯示「以 Keycloak 登入」按鈕（v0.5 修訂：Demo 偏好帳密登入） |
| `admin/src/app/layout.tsx` | 修改 | metadata title / description 從「推廣平台」改為「Azeroth Kanban」 |
| `admin/src/middleware.ts` | 修改 | matcher 增補 `/api/auth/callback/keycloak` 不被攔截（既有 `api/auth` 已排除，確認即可） |
| `admin/src/config/permissions.ts` | 修改 | `PERMISSIONS` 常數補 `KANBAN_VIEW / CREATE / EDIT / DELETE`、`ROLE_PERMISSIONS_VIEW / EDIT` 共 6 筆；移除 seed 未涵蓋的 `PERMISSIONS_VIEW` |
| `admin/src/app/api/v1/admin/permissions/route.ts` | 修改 | `withPermission` 守衛由舊的 `PERMISSIONS_VIEW` 改為 `ROLE_PERMISSIONS_VIEW`（端點僅供 Role-Permission Modal 載入權限列表） |
| `admin/src/locales/zh-TW.json` | 修改 | 補 `login.keycloakButton`、`admin.roles.permissionGroups.KANBAN`、`admin.roles.permissionGroups.ROLE_PERMISSIONS` 等 key |
| `admin/src/locales/en.json` | 修改 | 同上，英文翻譯 |
| `admin/.env.example` | 新增 | 列出所有必要 env：`DATABASE_URL`、`AUTH_SECRET`、`AUTH_KEYCLOAK_ID`、`AUTH_KEYCLOAK_SECRET`、`AUTH_KEYCLOAK_ISSUER`、`AUTH_ALLOW_CREDENTIALS`、`NEXTAUTH_URL`、`AUTH_TRUST_HOST` |

### keycloak/（新增資料夾）

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `keycloak/realm-export.json` | 新增 | Realm `kanban`：client `kanban-admin`（confidential，redirect URI `http://localhost:3010/api/auth/callback/keycloak`）、roles `admin / user / viewer`、3 個預設 users（admin@example.com / user@example.com / viewer@example.com，密碼 `Admin@1234` / `User@1234` / `Viewer@1234`） |
| `keycloak/README.md` | 新增 | 啟動 / 手動匯入 / 擴增使用者步驟 |

### 部署層

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `docker-compose.yml` | 修改 | 新增 `keycloak` service（quay.io/keycloak/keycloak:26.x，import realm volume mount）+ healthcheck；admin service 補 keycloak depends_on + Keycloak env 注入 |
| `admin/Dockerfile` | 修改 | 多階段 build runner stage 加 `tsx`（用於跑 seed）；CMD 改成 `["sh", "/app/admin/entrypoint.sh"]`；entrypoint 跑 `prisma migrate deploy`、`prisma db seed`、`node admin/server.js` |
| `admin/entrypoint.sh` | 新增 | bash script：等待 postgres ready → migrate → seed（idempotent，已有資料則跳過）→ start Next.js |
| `.env.example`（root） | 新增 | docker-compose 用的根層 env 範本 |

---

## 邏輯變更點

### prisma

- `Member` 由「強制 password + 強制本地帳密」改為「可選 password + 可選 keycloakSub」；`@@index([isActive])` 保留
- `KanbanCard` 主索引：複合索引 `(owner_id, status, sort_order)`，命名 `idx_owner_status_order`，對應主查詢 `WHERE owner_id = ? ORDER BY status, sort_order`
- `seed.ts`：依以下順序執行（用 `upsert` 確保 idempotent）
  1. `roles`（admin / user / viewer），`isSystem = true`
  2. `permissions`（14 筆，依 `groupCode` 分組：ROLES、USER_ROLES、AUDIT、KANBAN、ROLE_PERMISSIONS）
  3. `role_permissions`：admin 全 14、user 4 筆 kanban.*、viewer 1 筆 kanban.view
  4. `members`：3 筆預設帳號（bcrypt cost 12，僅作 Credentials fallback / 單機 Demo；`keycloakSub` 為 null 直到首次 SSO 登入）

### common

- `ApiErrorCode` 為 `as const` 物件，每個值為 dot-notation string（例如 `'auth.unauthorized'`），供前端 i18n key lookup 使用：
  ```typescript
  export const ApiErrorCode = {
    AUTH: {
      UNAUTHORIZED: 'auth.unauthorized',
      FORBIDDEN: 'auth.forbidden',
      INVALID_SESSION: 'auth.invalid_session',
    },
    VALIDATION: {
      REQUIRED: 'validation.required',
      MAX_LENGTH: 'validation.max_length',
    },
    KANBAN: {
      CARD_NOT_FOUND: 'kanban.card_not_found',
      FORBIDDEN_NOT_OWNER: 'kanban.forbidden_not_owner',
      INVALID_STATUS: 'kanban.invalid_status',
    },
    ROLE_PERMISSIONS: {
      ROLE_NOT_FOUND: 'role_permissions.role_not_found',
    },
    SYSTEM: {
      INTERNAL_ERROR: 'system.internal_error',
    },
  } as const;
  ```

### admin

- **`auth.ts`** — 雙 Provider 設計：
  - `KeycloakProvider`：v5 內建 provider，主流程
  - `CredentialsProvider`：保留但用 `if (process.env.AUTH_ALLOW_CREDENTIALS === 'true')` 條件加入；預設關閉
  - `signIn` callback：當 `account?.provider === 'keycloak'`，用 `prisma.member.upsert({ where: { keycloakSub: profile.sub }, update: {...}, create: {...} })`，從 `profile.realm_access.roles` 依優先級 `admin > user > viewer` 挑一個寫入 `member.role`
  - `jwt` callback：第一次登入時把 `member.id` / `member.role` 塞進 token；後續 refresh 不重查 DB
  - `recordLoginEvent`：保留並擴充支援 `provider: 'keycloak'`
- **`login/page.tsx`**：
  - 主要 UI 變為 single primary button「以 Keycloak 登入」(`signIn('keycloak')`)
  - 維持 `LanguageSwitcher` 與 logo 排版
  - 條件渲染：`process.env.NEXT_PUBLIC_AUTH_ALLOW_CREDENTIALS === 'true'` 時才顯示折疊的「本地帳密登入」區（提供 admin / user / viewer 三組預設）
- **`config/permissions.ts`**：`PERMISSIONS` 物件補入 6 筆新 key（與 seed 的 14 個 permission codes 對齊）

### 部署層

- **`admin/entrypoint.sh`**：
  ```sh
  #!/bin/sh
  set -e
  echo "[entrypoint] waiting for postgres..."
  until nc -z postgres 5432; do sleep 1; done
  echo "[entrypoint] running migrations..."
  npx prisma migrate deploy --schema=./prisma/schema.prisma
  echo "[entrypoint] running seed (idempotent)..."
  npx tsx prisma/seed.ts || echo "[entrypoint] seed skipped"
  echo "[entrypoint] starting Next.js..."
  exec node admin/server.js
  ```
- **`docker-compose.yml` keycloak service**：
  - image: `quay.io/keycloak/keycloak:26.0`
  - command: `start-dev --import-realm`
  - volumes: `./keycloak/realm-export.json:/opt/keycloak/data/import/realm-export.json:ro`
  - ports: `8080:8080`
  - environment: `KEYCLOAK_ADMIN=admin`、`KEYCLOAK_ADMIN_PASSWORD=admin`、`KC_HEALTH_ENABLED=true`
  - healthcheck: `curl -f http://localhost:8080/health/ready`

---

## 資料表異動

⚠️ **本 Spec 含資料庫異動**

| 資料表 | 欄位 | 異動類型 | 詳細說明 |
| --- | --- | --- | --- |
| `kanban_card` | — | **新增資料表** | 見 Plan § 資料表異動 完整 schema；含 `(owner_id, status, sort_order)` 複合索引 + FK → `members.id` ON DELETE CASCADE |
| `members` | `password` | 修改 | NOT NULL → NULLABLE（Keycloak 接管） |
| `members` | `keycloak_sub` | 新增欄位 | `VARCHAR` NULLABLE UNIQUE，Keycloak `sub` claim |
| `permissions` | — | seed 新增 6 筆 | `kanban.{view/create/edit/delete}`、`role_permissions.{view/edit}` |
| `role_permissions` | — | seed 重建 | admin: 14、user: 4、viewer: 1 |
| `roles` | — | seed 新增 3 筆 | `admin` / `user` / `viewer`，`isSystem=true` |

新增 enum：

```prisma
enum CardStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
}
```

Migration 注意事項：
- [x] 需要 down migration — Prisma 自動生成
- [x] 影響現有資料 — 既有 Member rows 因 password 欄位有值不受 nullable 改動影響；新欄位 keycloak_sub 預設 NULL
- [x] 影響 index — 新增 `idx_owner_status_order`
- [x] 外鍵約束變更 — 新增 `kanban_card.owner_id → members.id ON DELETE CASCADE`
- [x] 大資料表 — 本案資料量小，無 non-blocking migration 需求

---

## API 合約

本 Spec 不新增 / 不修改任何 API 端點。Kanban CRUD API 由 Spec B 負責；既有 `/api/v1/admin/roles/[id]/permissions` PUT 已可運作，本 Spec 重用。

NextAuth callback 路由由 NextAuth v5 自動處理：
- `/api/auth/signin/keycloak` — 由 `signIn('keycloak')` 觸發
- `/api/auth/callback/keycloak` — Keycloak 回呼
- `/api/auth/signout` — 登出

---

## 回滾計劃

1. **資料層回滾**：`npm run prisma:migrate -- --rollback` 或 `prisma migrate reset` 重置；保留舊 schema 檔在 git 上一版
2. **認證回滾**：`auth.ts` 移除 KeycloakProvider，恢復 CredentialsProvider 為唯一 provider
3. **部署回滾**：`docker-compose.yml` 移除 keycloak service；admin 的 entrypoint 改回 `node admin/server.js`

---

## 預期測試結果

- [ ] `npm run prisma:generate` 成功，Prisma Client 含 `KanbanCard` / `CardStatus` 型別
- [ ] `npm run prisma:migrate -- --name add_kanban_and_keycloak_support` 產出 migration 檔案，可在乾淨 DB 上重跑
- [ ] `npm run prisma:seed` 成功，DB 中存在：3 roles + 14 permissions + (14+4+1) role_permissions + 3 members
- [ ] `npm run type:check` 全 workspace 通過
- [ ] `npm run lint` 無新增錯誤
- [ ] `npm run build` 成功
- [ ] `docker compose down -v && docker compose up -d` 60–120 秒內三服務（postgres / keycloak / admin）皆 healthy
- [ ] 訪問 `http://localhost:3010` 自動 redirect 至登入頁，按「以 Keycloak 登入」可跳轉 Keycloak 登入畫面
- [ ] Keycloak 預設使用者 `admin@example.com / Admin@1234` 登入後可進入 `/admin`，session 內含 `roles: ['admin']`
- [ ] DB 中 `members` 表有對應 row（`keycloakSub` 已填入）
- [ ] `AUTH_ALLOW_CREDENTIALS=true` 時，登入頁顯示本地帳密區，可用 `admin@example.com / Admin@1234` 走 Credentials 登入
- [ ] `audit_logs` / `login_records` 紀錄登入事件（provider 為 `keycloak`）

---

## 風險評估

- **跨專案順序**：必須嚴格 prisma → common → admin。schema 沒先 migrate，admin 的 Prisma Client 會缺型別導致 type-check 失敗
- **Keycloak realm import 時序**：`start-dev --import-realm` 只在「資料目錄無此 realm」時匯入；改 realm-export.json 後若想重新匯入，需 `docker compose down -v` 清掉 volume
- **Member upsert by keycloak_sub**：若同一個 email 既存於本地（password 帳號）又在 Keycloak 註冊，第一次 SSO 登入會建立**新 row** 而非合併。本 Spec 暫不處理 email 衝突合併（PRD 未要求；面試規模可接受）；後續 Spec 若要處理需新增 Bug 紀錄
- **Realm export 可移植性**：`realm-export.json` 內含 client secret（明文），不適合進 production；本案為面試 Demo，明文可接受，但需於 `keycloak/README.md` 警告
- **entrypoint.sh 在 Windows 編輯**：CRLF 會導致 `sh` 解析錯誤，需確保以 LF 寫入（Write 工具產出為 LF）

---

## 實際變更

<!-- PostToolUse Hook 自動追加 Edit/Write 的檔案路徑 -->

## Bug Log

<!-- 開發過程中遇到的 Bug 將自動追加於此 -->

---

## AI 協作紀錄（本次 Spec 範圍）

> Spec A 隸屬於 Plan `20260423-001-kanban-board.md`，主要 AI 協作紀錄維護於 Plan；本區僅記錄 Spec A 範圍內的細節決策。

### 目標確認

實作 Kanban 看板的依賴根基：DB schema、認證機制、一鍵啟動部署。完成後 Spec B（Kanban 核心 API + 頁面）才能基於此繼續開發。

### 關鍵問答

#### 為什麼 Role-Permission UI 不在受影響檔案中？

**AI 回應摘要**：掃描既有程式碼後發現 `admin/src/app/admin/(dashboard)/roles/page.tsx` 已實作完整 Permission 勾選 Modal（含 group 全選、半選態、i18n key），Plan 原本「需開發」的這部分實際只剩下 seed 補 14 筆 permissions + i18n locales 補對應翻譯 key。本 Spec 重用既有 UI，避免重複開發。

#### Credentials provider 是否完全移除？

**AI 回應摘要**：保留但用 env 開關 `AUTH_ALLOW_CREDENTIALS` 控制，預設關閉。理由：(1) 面試展示時若 Keycloak 還未啟動或 demo 影片錄製需要快速登入，可臨時打開；(2) `prisma/seed.ts` 已 seed 3 個 bcrypt 密碼帳號，移除 Credentials provider 會讓這些帳號變成「永遠登不進去」的 dead data。

#### 為什麼 ApiErrorCode 用 dot-notation string 而不是 enum？

**AI 回應摘要**：值用 dot-notation 字串（如 `'kanban.card_not_found'`），可直接作為前端 i18n key lookup（`t(\`errors.\${result.errorCode}\`)`），避免 enum → string 的二次映射；structure 用 nested object 維持型別智能提示。Plan 提到的 `errorCode` 雙碼制即此設計。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| Spec A 範圍納入 docker-compose 與 entrypoint | ✅ 採納 | 避免 Spec B 開始實作 Kanban API 時還要回頭調整部署層 |
| 保留 Credentials provider，用 env 開關 | ✅ 採納 | 維持既有 seed 帳號的可用性；演示彈性 |
| 不重建 Role-Permission UI | ✅ 採納 | 既有 Modal 完整且 i18n-ready，重做反而引入回歸風險 |
| Member 加 `keycloakSub` 而非新建 `MemberKeycloakLink` join 表 | ✅ 採納 | KISS — 一個 Member 對應一個 Keycloak `sub`；單表 unique index 即可 |
| `password` 改 nullable 而非 default `''` | ✅ 採納 | nullable 在語意上更精確（無密碼 vs. 空字串），且 Prisma 的 `String?` 型別可直接讓 TS 端強制處理 null 情境 |
| ApiErrorCode 用 dot-notation 字串為值 | ✅ 採納 | 直接對應 i18n key，少一層映射 |
| `keycloak/realm-export.json` client secret 明文 | ✅ 採納（限本案） | 面試 Demo 可接受；README 警告 production 不可用 |

### 產出摘要

**程式碼異動**：

- `prisma/schema.prisma`：新增 `KanbanCard` model + `CardStatus` enum；`Member.password` 改 nullable + 加 `keycloakSub` unique
- `prisma/migrations/20260425120000_add_kanban_and_keycloak_support/migration.sql`：以 `prisma migrate diff --from-empty` 產出的 150 行 SQL（建表 + index + FK）
- `prisma/migrations/migration_lock.toml`：postgresql provider 鎖
- `prisma/seed.ts`：3 roles + 14 permissions + role-permission matrix（admin 14 / user 4 / viewer 1）+ 3 預設 Members（bcrypt cost 12）
- `common/src/api-error-code.ts`：dot-notation 字串值的 `ApiErrorCode` 常數字典 + `ApiErrorCodeValue` 型別
- `common/src/index.ts`：補 export
- `admin/src/auth.ts`：雙 Provider 設計（Keycloak 主 + Credentials 受 `AUTH_ALLOW_CREDENTIALS` 控制）；`signIn` callback upsert Member by `keycloakSub`，依 `realm_access.roles` 優先級 admin > user > viewer 挑單一 role
- `admin/src/app/admin/login/page.tsx`：主按鈕 Keycloak SSO，`NEXT_PUBLIC_AUTH_ALLOW_CREDENTIALS=true` 時下方折疊本地登入區塊
- `admin/src/config/permissions.ts`：移除 `PERMISSIONS_VIEW`，補 `KANBAN_*`、`ROLE_PERMISSIONS_*` 共 6 筆
- `admin/src/app/api/v1/admin/permissions/route.ts`：守衛改為 `ROLE_PERMISSIONS_VIEW`
- `admin/src/locales/{zh-TW,en}.json`：補 `login.keycloakButton/keycloakLoading/useLocalLogin/hideLocalLogin` 4 keys
- `admin/.env.example`、`.env.example`：補 Keycloak / fallback 相關 env
- `keycloak/realm-export.json`：realm `kanban` + client `kanban-admin`（confidential）+ 3 roles + 3 預設 SSO users
- `keycloak/README.md`：啟動 / 重置 / 安全提醒文件
- `admin/entrypoint.sh`：等待 postgres → migrate deploy → seed → start Next.js
- `admin/Dockerfile`：補 prisma CLI、tsx、bcryptjs 進 runner stage；裝 busybox-extras 提供 `nc`；CMD 改用 entrypoint.sh
- `docker-compose.yml`：新增 keycloak service（image quay.io/keycloak/keycloak:26.0、`--import-realm`、`KC_HOSTNAME=host.docker.internal`、healthcheck）；admin service 補 keycloak depends_on、`extra_hosts: host-gateway`、Keycloak env

**驗證結果**：

- `npm run type:check` ✅ 全 workspace 通過
- `npm run lint` ✅（僅一個既有 warning，非本 Spec 範圍）
- `npm run build` ✅ admin 17 routes 全部成功編譯
- `prisma migrate diff` ✅ 自 empty schema 產出 150 行 migration SQL，已存入 migrations/

**待使用者驗證（無 Docker 環境無法自動跑）**：

- `docker compose down -v && docker compose up -d` → 三服務 healthy
- 訪問 `http://localhost:3010` → 自動 redirect 至登入頁
- 「以 Keycloak 登入」按鈕 → 跳轉 Keycloak 登入畫面 → 用 `admin@example.com / Admin@1234` 登入 → 回到 admin
- 確認 `members` 表有對應 row 且 `keycloak_sub` 已填入
- `audit_logs` / `login_records` 紀錄登入事件（provider=`keycloak`）

**設計取捨**：

- `host.docker.internal` 作為 Keycloak canonical hostname：解決「容器內 admin 與 host 瀏覽器使用同一 issuer URL」問題；Linux 需手動加 `127.0.0.1 host.docker.internal` 至 `/etc/hosts`，已於 docker-compose 加 `extra_hosts: host-gateway` 讓容器自動解析
- migration 採「先以 `migrate diff` 產 SQL → checked in」而非依賴執行時 `migrate dev`：production-deploy 路徑乾淨，且 entrypoint.sh 用 `migrate deploy` 不會觸發 shadow DB 建立
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/prisma/schema.prisma` — Edit @ 2026-04-25 04:20
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/prisma/seed.ts` — Write @ 2026-04-25 04:21
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/common/src/api-error-code.ts` — Write @ 2026-04-25 04:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/common/src/index.ts` — Edit @ 2026-04-25 04:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/config/permissions.ts` — Edit @ 2026-04-25 04:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/api/v1/admin/permissions/route.ts` — Edit @ 2026-04-25 04:23
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/auth.ts` — Write @ 2026-04-25 04:23
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/login/page.tsx` — Write @ 2026-04-25 04:24
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/auth.ts` — Edit @ 2026-04-25 04:25
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/layout.tsx` — Edit @ 2026-04-25 05:15
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/login/page.tsx` — Edit @ 2026-04-25 05:18
