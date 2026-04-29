# Kanban 看板 — 跨擁有者檢視 / 編輯 / 刪除權限

> 建立日期: 2026-04-29
> 完成日期: 2026-04-29
> 狀態: ✅ 已完成
> 關聯計劃書: `C:\Users\a4756\.claude\plans\sorted-painting-babbage.md`

---

## 目標

新增 3 個權限 (`kanban.view_all` / `kanban.edit_all` / `kanban.delete_all`)，讓持有者能跨越「只能管自己卡片」的限制：

- `view_all` → 看板會直接顯示所有人的卡片，每張卡顯示 owner 頭像 + 名稱
- `edit_all` → 可編輯 / 拖拉任何人的卡片
- `delete_all` → 可刪除任何人的卡片

admin 角色透過 `PERMISSIONS.map((p) => p.code)` 自動繼承這 3 個權限；user / viewer 預設不取得，可由 admin 在 `/admin/roles` UI 個別授予。

## 背景

目前所有 Kanban API 與 service 層都硬性過濾 `where: { id, ownerId: session.user.memberId }`，導致 admin 無法看到或管理其他使用者的卡片。系統本身已有完整的 RBAC 架構（`Permission` / `Role` / `RolePermission`），新增權限只需 seed 3 筆 row + 路由與 service 層加上「ownership 不符時 fallback 檢查 `_all` 權限」即可。

設計準則：
- **admin 反向白名單**：seed.ts 內 `admin: PERMISSIONS.map((p) => p.code)` 自動取得所有權限
- **其他角色正向白名單**：顯式列出可用權限，不含 `_all`
- **service layer 鎖定**：透過 `bypassOwnership` 旗標切換是否強制 owner 過濾，由 route layer 在驗證後傳入

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ✅ | seed.ts 新增 3 筆 Permission row（schema 不動） |
| `common` | ❌ | 不影響 |
| `admin` | ✅ | 權限常數、kanban-service、3 支 API route、看板 UI 元件 4 支 |

## 建議開發順序

1. `prisma` — `seed.ts` 追加 3 筆 PERMISSIONS row（admin matrix 不改）
2. `admin` —
   1. `config/permissions.ts` 加 3 個 const
   2. `lib/kanban-service.ts` CardDto 加 `owner`、新增 `listAllBoard`、各方法加 `bypassOwnership`
   3. 3 支 API route 加 ownership 守衛
   4. UI hook + 3 支元件 + page

---

## 受影響檔案

### prisma

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `prisma/seed.ts` | 修改 | PERMISSIONS 陣列追加 3 筆 KANBAN 權限 |

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/config/permissions.ts` | 修改 | 追加 KANBAN_VIEW_ALL / KANBAN_EDIT_ALL / KANBAN_DELETE_ALL |
| `admin/src/lib/kanban-service.ts` | 修改 | CardDto 加 owner、新增 listAllBoard、各方法加 bypassOwnership 參數 |
| `admin/src/lib/kanban-permission.ts` | 新增 | 共用 helper：檢查 actor 是否為卡片 owner，否則檢查 _all 權限 |
| `admin/src/app/api/v1/kanban/cards/route.ts` | 修改 | GET 依 view_all 切換 listAllBoard / listOwnerBoard |
| `admin/src/app/api/v1/kanban/cards/[id]/route.ts` | 修改 | PATCH / DELETE 加 ownership 守衛 + edit_all / delete_all fallback |
| `admin/src/app/api/v1/kanban/cards/[id]/move/route.ts` | 修改 | POST 同上（沿用 edit_all gate） |
| `admin/src/app/(dashboard)/kanban/_lib/use-kanban-board.ts` | 修改 | CardDto 加 owner |
| `admin/src/app/(dashboard)/kanban/_components/kanban-card.tsx` | 修改 | 顯示 owner、按 canEdit/canDelete 控制按鈕與拖拉 |
| `admin/src/app/(dashboard)/kanban/_components/kanban-column.tsx` | 修改 | 穿透 currentMemberId / canEdit / canDelete / canEditAll / canDeleteAll，逐張卡計算 |
| `admin/src/app/(dashboard)/kanban/page.tsx` | 修改 | 取得新權限 + currentMemberId、傳給 column |
| `admin/src/locales/zh-TW.json` | 修改 | 新增 owner 顯示字串（依現有 i18n 結構） |
| `admin/src/locales/en.json` | 修改 | 同上（英文版） |

---

## 邏輯變更點

### prisma/seed.ts

PERMISSIONS 陣列尾端 KANBAN 群組之後追加：

```ts
{ code: 'kanban.view_all',   groupCode: 'KANBAN', groupName: '看板', name: '檢視所有卡片', description: '檢視所有使用者建立的卡片（含 owner 資訊）' },
{ code: 'kanban.edit_all',   groupCode: 'KANBAN', groupName: '看板', name: '編輯所有卡片', description: '編輯任何使用者的卡片（含拖拉改狀態 / 排序）' },
{ code: 'kanban.delete_all', groupCode: 'KANBAN', groupName: '看板', name: '刪除所有卡片', description: '刪除任何使用者的卡片' },
```

`ROLE_PERMISSION_MATRIX` 完全不動 — admin 用 `PERMISSIONS.map((p) => p.code)` 自動繼承新權限。

### admin/src/lib/kanban-service.ts

- `OwnerDto` 新型別：`{ id, name: string | null, email }`
- `CardDto` 加 `owner: OwnerDto` 欄位
- `toDto(card)` 改為 `toDto(card, owner)`，把 owner 一併包進回傳
- `listOwnerBoard(ownerId)` 加 `include: { owner: true }`，把 owner 一併投影到 DTO
- 新增 `listAllBoard()`：不過濾 ownerId、`include: { owner: true }`，回 GroupedCards
- `getCard / updateCard / deleteCard / moveCard` 加 optional `options?: { bypassOwnership?: boolean }`，當 `bypassOwnership=true` 時 `where` 不帶 ownerId
- `moveCard.computeSortOrder` 內 sort 計算改為基於**目標卡實際的 ownerId**（而非 actor 的 memberId），跨 owner 拖拉才能找到參考卡片

### admin/src/app/api/v1/kanban/cards/route.ts (GET)

```ts
const canViewAll = await hasPermission(session.user.roles, PERMISSIONS.KANBAN_VIEW_ALL);
return ApiResponse.json(canViewAll ? await listAllBoard() : await listOwnerBoard(memberId));
```

### admin/src/app/api/v1/kanban/cards/[id]/route.ts (PATCH / DELETE)

新增私有 helper `ensureOwnerOrAllPermission(session, cardId, allPermission)`：

1. 撈 card.ownerId
2. 若 ownerId === session.memberId → `bypassOwnership: false`、放行
3. 否則檢查 `hasPermission(roles, allPermission)`：通過則 `bypassOwnership: true`、放行；不通過回 403
4. card 不存在 → 404

PATCH 用 `KANBAN_EDIT_ALL`、DELETE 用 `KANBAN_DELETE_ALL`。service 呼叫時 ownerId 傳卡片真正 owner（取自步驟 1）。

### admin/src/app/api/v1/kanban/cards/[id]/move/route.ts (POST)

同 PATCH 流程，使用 `KANBAN_EDIT_ALL`（move 視為 edit）。

### UI 層

- `use-kanban-board.ts`：CardDto 加 `owner`
- `page.tsx`：新增 `canEditAll / canDeleteAll = useHasPermission(...)`、用 `useSession()` 取 `currentMemberId`、傳給 `<KanbanColumn>`
- `kanban-column.tsx`：把 props 透傳給 `<KanbanCard>`
- `kanban-card.tsx`：
  - 顯示 owner（avatar + name；自己的卡顯示「我」）
  - 用 `canEdit` / `canDelete` props 控制按鈕與拖拉是否啟用（取代既有的 `readOnly`）

---

## 資料表異動

**無 schema 變更。** 僅 seed 新增 3 筆 `permissions` data row，由 seed.ts 既有 upsert 邏輯處理。

Migration 注意事項：
- [ ] 不需要 down migration（純 data，可手動 `DELETE FROM permissions WHERE code IN ('kanban.view_all', 'kanban.edit_all', 'kanban.delete_all')` 回滾）
- [ ] 不影響現有資料
- [ ] 不影響 index
- [ ] 無外鍵約束變更

## API 合約

| 端點 | 方法 | 請求格式變更 | 回應格式變更 |
| --- | --- | --- | --- |
| `/api/v1/kanban/cards` | GET | 無 | 每張卡片 DTO 新增 `owner: { id, name, email }` 欄位；持 `kanban.view_all` 者回傳全部使用者的卡片 |
| `/api/v1/kanban/cards/[id]` | PATCH | 無 | 跨 owner 操作時 403 → 需 `kanban.edit_all` |
| `/api/v1/kanban/cards/[id]` | DELETE | 無 | 跨 owner 操作時 403 → 需 `kanban.delete_all` |
| `/api/v1/kanban/cards/[id]/move` | POST | 無 | 跨 owner 操作時 403 → 需 `kanban.edit_all` |

## 回滾計劃

1. 還原本 commit（透過 git revert）
2. 執行 `npm run prisma:seed`：因為 PERMISSIONS 陣列已恢復原狀，但既有的 3 筆 `_all` permissions 需手動清掉：`DELETE FROM permissions WHERE code IN ('kanban.view_all','kanban.edit_all','kanban.delete_all');`（CASCADE 會清掉對應的 `role_permissions`）

## 預期測試結果

- [ ] seed 後 permissions 表有 15 筆，其中 3 筆是新加的 `kanban.*_all`
- [ ] admin 角色 role_permissions 對應 15 筆
- [ ] admin 登入 → /admin/roles → Set Permissions → 看板群組顯示 7 筆權限
- [ ] admin 登入 → /admin/kanban → 看到所有人卡片，每張卡顯示 owner
- [ ] admin 拖拉別人的卡跨欄 → 成功；audit_logs 寫入 actorId=admin
- [ ] admin 編輯 / 刪除別人的卡 → 成功
- [ ] user 登入 → /admin/kanban → 仍只看自己卡片（回歸測試）
- [ ] user 直接 PATCH 別人的 cardId → 403
- [ ] user 直接 DELETE 別人的 cardId → 403
- [ ] /admin/roles 把 view_all 加給 user → user 重登後可看到所有卡片，但編輯按鈕在別人的卡上仍隱藏

## 風險評估

- **跨 owner 拖拉的 sortOrder 計算**：`computeSortOrder` 原本以 actor 的 ownerId 過濾參考卡，跨 owner 操作會找不到，必須改為以目標卡的 ownerId 為準（已在邏輯變更點標註）
- **CardDto 結構變更**：所有消費 `/api/v1/kanban/cards*` 的地方（前端 hook、未來可能的 mobile client）都會收到多出的 `owner` 欄位 — 對 TypeScript 為加欄位非破壞性，但 Prisma 查詢必須記得 `include: { owner: true }`
- **Permission cache**：`hasPermission` 5 分鐘 cache，admin 在 /admin/roles UI 改完權限後可能要等最多 5 分鐘才反映；實作時可考慮在 role_permissions 寫入後呼叫 `clearPermissionCache()`（既有 API）

---

## 實際變更

<!-- PostToolUse Hook 自動追加 Edit/Write 的檔案路徑 -->

## Bug Log

<!-- 開發過程中遇到的 Bug -->

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

讓系統管理員能在看板看到並管理所有使用者的卡片，能力以權限模型暴露（而非硬編碼 admin 角色），方便未來授予其他角色。

### 關鍵問答

#### 權限拆分粒度（view / edit / delete 是否合一）

**AI 回應摘要**: 提供三種選項給使用者選擇，最終決議拆成 3 個獨立權限，彈性最高，符合 admin/UI 已存在的群組顯示模式。

#### 預設視圖（toggle vs 直接全顯示）

**AI 回應摘要**: 兩種方案，使用者選「直接全顯示，每張卡顯示 owner」，零點擊、最直觀。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 拆成 3 個獨立權限 vs 合一的 manage_all | ✅ 採納 拆分 | 彈性最高，admin 反向白名單自動繼承，其他角色可單獨授予 |
| 直接全顯示 vs toggle 切換 | ✅ 採納 直接全顯示 | 零點擊、UI 簡潔；owner 資訊已能區分卡片歸屬 |
| service 用 bypassOwnership flag vs 拆 \*\_byId 系列方法 | ✅ 採納 bypassOwnership | 單一程式路徑，避免重複 service 函式 |
| Audit log 加 targetOwnerId 欄位 | ❌ 棄用 | 既有 entityId + 卡片本體已可追溯；不增加額外資料表異動 |

### 產出摘要

<!-- 完成後自動更新 -->
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/prisma/seed.ts` — Edit @ 2026-04-29 12:18
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/config/permissions.ts` — Edit @ 2026-04-29 12:19
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/lib/kanban-service.ts` — Write @ 2026-04-29 12:20
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/api/v1/kanban/cards/route.ts` — Write @ 2026-04-29 12:21
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/lib/kanban-permission.ts` — Write @ 2026-04-29 12:21
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/api/v1/kanban/cards/[id]/route.ts` — Write @ 2026-04-29 12:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/api/v1/kanban/cards/[id]/move/route.ts` — Write @ 2026-04-29 12:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/kanban/_lib/use-kanban-board.ts` — Edit @ 2026-04-29 12:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/kanban/_components/kanban-card.tsx` — Write @ 2026-04-29 12:23
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/kanban/_components/kanban-column.tsx` — Write @ 2026-04-29 12:23
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/kanban/page.tsx` — Write @ 2026-04-29 12:23
