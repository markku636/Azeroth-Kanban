---
name: RBAC 權限模型 + withPermission decorator + 5 分鐘 in-memory 快取
description: Member.role(string) → Role → RolePermission → Permission 三層；withPermission decorator 守 API；getUserPermissions 走 5 分鐘 process-local 快取
type: architecture
---

# RBAC 權限模型 + withPermission decorator + 5 分鐘 in-memory 快取

> 建立日期: 2026-04-25
> 分類: architecture
> 來源 Spec: `20260425-001-keycloak-auth-and-deployment`、`20260425-002-kanban-core`
> 來源 Bug: 無

---

## 背景

本專案用「角色字串掛在 Member、權限細項掛在 Role」的兩段式 RBAC：登入態（session）只認 role 字串，每次 API call 才把 role 展開成 permission codes。為了避免每個 request 都往 DB 撈 role-permission，引入 process-local 5 分鐘 TTL in-memory 快取；為了讓 API route 寫法一致，引入 `withPermission(code, handler)` decorator。

## 知識內容

### 資料模型（4 張表 + Member.role）

```
Member { id, email, role: string?, keycloakSub?, ... }
        │  role 是平面字串（'admin' / 'user' / 'viewer'）
        │  ⚠️ 沒有外鍵指向 Role，刻意 loose-coupled
        ▼
Role { id, name (UNIQUE), displayName, isSystem }
        │
        ▼ RolePermission { roleId, permissionId } (UNIQUE 雙欄)
        │
        ▼
Permission { id, code (UNIQUE), name, groupCode, groupName }
```

[`prisma/schema.prisma`](../../../prisma/schema.prisma)：

- `Member.role` 是純字串（`role String?`），**沒有外鍵指向 `Role.name`**。
- `Role` ↔ `Permission` 走 `RolePermission` join 表，雙欄 unique 防重複指派。
- `Permission.groupCode / groupName` 用於前端分組顯示（例：「角色管理」群組下的 `roles.view / roles.create / ...`），DB 層不參與權限判斷。

#### 為什麼 Member.role 是字串而非外鍵？

刻意設計，三個理由：

1. **Keycloak 也是字串 role**：`profile.realm_access.roles` 回的就是 string array，[`auth.ts`](../../../admin/src/auth.ts) 的 `pickPrimaryRole` 直接挑優先級最高的字串寫入 `Member.role`。如果做成外鍵，每次 SSO 登入要先去 `Role` 表 lookup，多一次 DB 往返且要處理「Keycloak 有此 role 但本地 Role 表還沒同步」的時序。
2. **快取 key 友善**：[`permission-service.ts`](../../../admin/src/lib/permission-service.ts) 用 `roles.sort().join(',')` 當快取 key，字串比 id 容易序列化、跨 process 對齊。
3. **Member 表掃描快**：`Member.role = 'admin'` 的查詢不需要 join，未來真要做「列出所有 admin」也只是 b-tree index seek。

代價：刪 / rename 一個 Role 不會自動級聯到 Member。本專案 `Role.isSystem = true` 的內建 role 不允許刪除（在 service 層擋），可接受這個 trade-off。

### Session → Permission 的展開流程

```
HTTP Request
   │
   ▼
[1] withPermission('kanban.view', handler)
   │
   ▼
[2] auth() → session.user.roles: string[]   (從 NextAuth JWT 解出，不打 DB)
   │
   ▼
[3] hasPermission(roles, 'kanban.view')
   │
   ▼
[4] getUserPermissions(roles)               (查或讀快取)
   │      ┌─ cache hit  → 回 permission codes
   │      └─ cache miss → DB 查 RolePermission, set cache, 回
   ▼
[5] permission.includes('kanban.view') ? next() : 403
```

實證：[`admin/src/lib/with-permission.ts`](../../../admin/src/lib/with-permission.ts) — decorator 只做 (1) auth、(2) hasPermission、(3) 401 / 403 / 放行。

### 5 分鐘 in-memory 快取設計

```ts
const CACHE_TTL = 5 * 60 * 1000;  // 5 minutes
const permissionCache = new Map<string, { permissions: string[]; expiresAt: number }>();

export async function getUserPermissions(roles: string[]): Promise<string[]> {
  if (!roles.length) return [];
  const cacheKey = [...roles].sort().join(',');   // 排序後 join 才穩定

  const cached = permissionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions;
  }

  const rolePermissions = await prisma.rolePermission.findMany({
    where: { role: { name: { in: roles } } },
    include: { permission: { select: { code: true } } },
  });
  const permissions = Array.from(new Set(rolePermissions.map((rp) => rp.permission.code)));

  permissionCache.set(cacheKey, { permissions, expiresAt: Date.now() + CACHE_TTL });
  return permissions;
}
```

#### 設計取捨

| 面向 | 選擇 | 替代方案 | 為何不選 |
| --- | --- | --- | --- |
| 快取層級 | process-local `Map` | Redis | 單一 admin 容器、單實例部署，Redis 是 over-engineering |
| TTL | 5 分鐘 | 永久 + invalidate API | 角色-權限改動頻率低，5 分鐘延遲可接受；省維護 invalidate 邏輯 |
| Key | sorted role names join `,` | per-user JWT id | 多使用者共享同一組 roles 可命中同一 cache entry |
| 失效 | TTL 到期自然淘汰 | mutation 後主動清 | 已暴露 `clearPermissionCache()`；Role/RolePermission CRUD 後手動呼叫 |

**主動失效時機**：當 Role / RolePermission CRUD 完成後，service 應呼叫 `clearPermissionCache()` 清整個 Map（粗暴但簡單，cache 容量小）。否則 admin 改完權限要等最多 5 分鐘才生效。

#### 注意：Next.js dev 模式 cache 不穩定

Next.js dev server 對 server module 有 hot reload，每次改 code 會把 module 重 evaluate，**cache 隨之歸零**。這在 dev 是好事（省得手動清），但測試「快取命中行為」要在 production build 跑。

#### 注意：多 instance 部署 cache 會分裂

若未來改成多容器 / 多 worker，每個 process 各持一份 cache，TTL 內的權限變更只會反映在其中一個 process 上。屆時要：(a) 改用 Redis 共享；或 (b) 縮 TTL 至 30~60 秒；或 (c) 用 pub/sub 廣播 invalidate。本專案目前單實例，先記下這個 future trade-off。

### `PERMISSIONS` 常數字典與 seed 一一對應

[`admin/src/config/permissions.ts`](../../../admin/src/config/permissions.ts) 把所有 permission code 集中為常數：

```ts
export const PERMISSIONS = {
  KANBAN_VIEW:   'kanban.view',
  KANBAN_CREATE: 'kanban.create',
  KANBAN_EDIT:   'kanban.edit',
  KANBAN_DELETE: 'kanban.delete',
  // ...
} as const;
export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
```

API route 寫成 `withPermission(PERMISSIONS.KANBAN_VIEW, handler)` 而非 `withPermission('kanban.view', handler)`，TS 會在 typo 時直接報錯。

**新增 permission 的硬性流程**（順序不能變）：

1. `prisma/seed.ts` 加一筆 `Permission` upsert（`code`、`name`、`groupCode`、`groupName`）
2. `npm run prisma:seed`
3. `admin/src/config/permissions.ts` 加對應常數
4. API route 用 `withPermission(PERMISSIONS.NEW_CODE, handler)` 套用
5. 視需要在 admin 後台「角色-權限」頁面把新 code 指派給 role

只有第 1 + 2 步沒做就 import 第 3 步的常數會 TS-pass 但 runtime 永遠 403（DB 沒這個 permission row）。

### NextAuth JWT 與 RBAC 的接合

NextAuth 的 `session.user.roles` 是字串陣列（雖然目前實際只塞單一 role）。在 [`auth.ts`](../../../admin/src/auth.ts) callbacks：

- `signIn`（Keycloak）：upsert Member、從 `realm_access.roles` 挑 primary role 寫 DB
- `jwt`：第一次登入把 `member.id` 與 `[member.role]` 塞進 token
- `session`：把 `token.memberId` / `token.roles` 攤到 `session.user`

JWT TTL 設 `60 * 60 * 8`（8 小時）。**8 小時內 role 變更不會反映到 session**，使用者必須登出再登入。這是 NextAuth JWT 策略的本質限制；換成 database session strategy 才能即時。本專案接受這個限制（內部後台、role 變動頻率低）。

## 適用場景

- 新增 API endpoint 並決定其權限：先看 `PERMISSIONS` 字典是否有合適 code，沒有則先補 seed
- 新增資源類型（例如 reports、teams）：在 `Permission.groupCode` 開新群組，遵循「{group}.{action}」命名
- 規劃 role / role-permission 編輯功能：mutation 完成後務必呼叫 `clearPermissionCache()`，否則 5 分鐘內角色變更不生效
- 思考多實例部署：先確認 cache 分裂的影響，再決定升級到 Redis 或縮 TTL
- 評估「使用者刪除 role 後 Member.role 殘留」的處理：service 層需擋 `Role.isSystem = true` 的刪除，並決定刪 user-defined role 時是否清空 Member.role

## 注意事項

- **`Member.role` 是字串、不是外鍵**：刪除 / 重新命名 Role 不會級聯。新增 mutation 時記得手動處理懸空 reference。
- **`getUserPermissions([])` 回空陣列**：未登入或 token 沒有 roles 時不要直接呼叫，避免快取一筆 `''` key 的空權限污染。
- **快取 key 是 role 字串排序後 join**：若未來改成 role id，要同步改快取 key 邏輯，否則同一使用者會 cache miss 兩次。
- **`clearPermissionCache()` 是粗暴清空**：所有人 cache 都被清掉。OK for low-frequency role mutation；高頻時要改 per-key invalidate。
- **`withPermission` 假設 handler signature 為 `(req, ctx)`**：dynamic route `/[id]` 的 handler 型別 `context.params: Promise<{ id: string }>`（Next 15 必為 Promise），decorator 已支援。
- **Public endpoint 不要套 withPermission**：`auth()` 內部會 redirect / 401，會破壞「無需登入也能取資料」語意。Public 直接寫 raw handler。
- **JWT TTL 8 小時內 role 不會更新**：admin 改完 role 後要請使用者重新登入，或日後改 database session 策略。
- **Permission code 命名**：`{groupCode}.{action}`，groupCode 為 lower_snake_case，action 為簡短動詞（view / create / edit / delete）。新增動作時先看是否能複用既有四個。

---

<!-- 此文件為永久知識庫，AI 可在後續開發中追加更新 -->
<!-- 更新記錄：
  - 2026-04-25: 初次建立，從目前系統架構提煉
-->
