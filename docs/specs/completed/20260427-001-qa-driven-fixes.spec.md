# QA 驅動修正：RBAC 漏洞、Toast 文案、RWD 與可訪問性

> 建立日期: 2026-04-27
> 狀態: ✅ 已完成
> 關聯計劃書: 無（QA 驅動的小型集中修正，跳過 PRD 與 Plan）

---

## 目標

修復 `/qa-kanban all`（[`.tmp/qa-reports/20260426-2317/report.md`](.tmp/qa-reports/20260426-2317/report.md)）回報的真實問題，按嚴重度排序：

| 優先級 | 問題 | 修法 |
|--------|------|------|
| 🚨 高 | viewer 可訪問 `/roles` 等管理頁（middleware 只擋未登入，無 per-page RBAC） | 新增 `requirePermission()` server helper + 4 個受保護頁的 server `layout.tsx` |
| 🚨 高 | viewer kanban 頁仍看到 inline 新增表單（按鈕 disabled，但欄位可輸入） | 在 `kanban/page.tsx` 用 `useHasPermission('kanban.create')` 條件渲染；卡片 icon 也以 `useHasPermission('kanban.edit')` 控 `readOnly` |
| ⚠️ 中 | `updateCard` 改狀態時 toast 顯示「卡片已更新」，PRD 期望「卡片已移動至「{狀態}」!」 | 在 `use-kanban-board.ts` 比對 `patch.status` 與舊狀態，分流 toast |
| ⚠️ 中 | `moveCard` 同欄重排也跳「卡片已移動至…」toast，PRD 期望同欄 reorder 不 toast | 比對 `fromStatus === toStatus` → 略過 toast |
| ⚠️ 中 | 手機 <640px 四欄仍水平排列，PRD 期望縱向堆疊 | `kanban/page.tsx` board container 加 `sm:flex-col` 路徑；`kanban-column` 移除水平 snap |
| ⚠️ 中 | 卡片 icon button 22×22 < WCAG 44×44 | `kanban-card.tsx` 把 `p-1` + `h-3.5 w-3.5` 改成 `p-2.5` + `h-5 w-5`，整顆 ≥ 44×44 |
| 💬 低 | 狀態 emoji 與 PRD 不符（☐/▶/👁/✅ → 📋/🚀/👀/✅） | `card-status.ts` 改 emoji |
| 💬 低 | 新增 toast 文案「卡片已建立」→「卡片已新增至「待處理」!」 | i18n key `kanban.createSuccess` 改成包含目標狀態 |

**不在本次處理：**

- errorCode 命名格式（PRD `KANBAN_CARD_TITLE_REQUIRED` vs 實作 `kanban.title_required`）— 改造範圍跨 common/admin/i18n/seed，建議改 PRD 跟著實作
- AC 4.6 optimistic UI 失敗 rollback、AC 6.4 Keycloak SSO logout — 環境性 Skip
- i18n 切換 / inline form API 400 toast — code review 顯示實作正確（`useTranslation` hook、`addCard` 都有 `toast.error`）；QA 觀察為偽陽性，本次不改

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema 變更 |
| `common` | ❌ | 無共用型別變更 |
| `admin` | ✅ | 新增 RBAC helper + 4 個受保護頁 layout、修 toast 流程、調整 RWD 與 a11y |

## 建議開發順序

1. RBAC server guard（最高安全性優先級）
2. Toast 流程分流（移動 vs 更新；同欄不 toast）
3. UI 隱藏與 RWD（viewer inline form、手機縱向、icon 點擊區）
4. 視覺微調（emoji、createSuccess 文案）

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/require-permission.ts` | 新增 | server helper：取 session → 沒登入 redirect `/login`；缺 perm redirect `/kanban`；export `requirePermission(code)` |
| `admin/src/app/(dashboard)/roles/layout.tsx` | 新增 | server layout，呼叫 `requirePermission(PERMISSIONS.ROLES_VIEW)` 後 render children |
| `admin/src/app/(dashboard)/user-roles/layout.tsx` | 新增 | 同上，`USER_ROLES_VIEW` |
| `admin/src/app/(dashboard)/audit-logs/layout.tsx` | 新增 | 同上，`AUDIT_LOGS_VIEW` |
| `admin/src/app/(dashboard)/login-records/layout.tsx` | 新增 | 同上，`LOGIN_RECORDS_VIEW` |
| `admin/src/app/(dashboard)/kanban/page.tsx` | 修改 | 用 `useHasPermission('kanban.create')` 條件渲染 `<InlineCardForm>`；用 `useHasPermission('kanban.edit')` 計 `readOnly` 並傳給 `<KanbanColumn>` |
| `admin/src/app/(dashboard)/kanban/_lib/use-kanban-board.ts` | 修改 | `updateCard`：比對 patch.status 與舊狀態，狀態變動走 `moveSuccess`、其他走 `updateSuccess`；`moveCard`：fromStatus === toStatus 略過 toast |
| `admin/src/app/(dashboard)/kanban/_lib/card-status.ts` | 修改 | emoji ☐/▶/👁/✅ → 📋/🚀/👀/✅ |
| `admin/src/app/(dashboard)/kanban/_components/kanban-card.tsx` | 修改 | 兩顆 icon button：`p-1` `h-3.5 w-3.5` → `p-2.5` `h-5 w-5`，整顆 padding box ≥ 44×44 |
| `admin/src/app/(dashboard)/kanban/page.tsx` | 修改（同上） | board container responsive class：`<sm` 縱向 (`flex-col`)，移除水平 snap；`sm:flex-row sm:overflow-x-auto sm:snap-x sm:snap-mandatory`；`lg:grid lg:grid-cols-4` 維持 |
| `admin/src/app/(dashboard)/kanban/_components/kanban-column.tsx` | 修改 | column 寬度與 snap 屬性改成 RWD friendly：`min-w-[280px]` 在 `sm:` 以上才有；mobile 一欄就用 `w-full` |
| `admin/src/locales/zh-TW.json` | 修改 | `admin.kanban.createSuccess` 改成「卡片已新增至「待處理」!」 |
| `admin/src/locales/en.json` | 修改 | `admin.kanban.createSuccess` 改成 `Card added to "Todo"!` |

> 註：`me`、`kanban` 兩個頁面**不**加 server-side perm guard，所有登入用戶皆可存取（kanban 透過 inline form / readOnly 條件渲染做 client-side 角色差異）。

---

## 邏輯變更點

### `admin/src/lib/require-permission.ts`（新檔）

```ts
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permission-service';

export async function requirePermission(code: string): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const roles = (session.user.roles ?? []) as string[];
  const ok = await hasPermission(roles, code);
  if (!ok) redirect('/kanban');
}
```

### Per-page `layout.tsx`（新檔範本）

```tsx
import { requirePermission } from '@/lib/require-permission';
import { PERMISSIONS } from '@/config/permissions';

export default async function RolesLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PERMISSIONS.ROLES_VIEW);
  return <>{children}</>;
}
```

### `use-kanban-board.ts` toast 分流

```ts
// updateCard
const oldStatus = (() => {
  for (const s of CARD_STATUS_ORDER) {
    if (board[s].some((c) => c.id === id)) return s;
  }
  return null;
})();
// ... existing optimistic + API call ...
if (res.success && res.data) {
  if (patch.status && patch.status !== oldStatus) {
    await loadBoard();
    toast.success(t('admin.kanban.moveSuccess', { status: t(`admin.kanban.status${capitalize(patch.status)}`) }));
  } else {
    toast.success(t('admin.kanban.updateSuccess'));
  }
  return true;
}

// moveCard：fromStatus === toStatus 略過 toast
const fromStatus = movedCard.status;
// ...
if (res.success && res.data) {
  await loadBoard();
  if (fromStatus !== toStatus) {
    toast.success(t('admin.kanban.moveSuccess', { status: t(`admin.kanban.status${capitalize(toStatus)}`) }));
  }
  return true;
}
```

### `kanban/page.tsx` 條件渲染

```tsx
const canCreate = useHasPermission('kanban.create');
const canEdit = useHasPermission('kanban.edit');
// ...
{canCreate && (
  <div className="mb-4">
    <InlineCardForm onSubmit={addCard} disabled={loading} />
  </div>
)}
// ...
<KanbanColumn ... readOnly={!canEdit} />
```

## 資料表異動

無。

## API 合約

無變更。

## 回滾計劃

`git revert <commit>`（無 DB / migration 改動）

## 預期測試結果

- [x] viewer 訪問 `/roles`、`/user-roles`、`/audit-logs`、`/login-records` 都被 redirect 到 `/kanban`（curl 全部 307 → /kanban，已驗證）
- [x] admin 訪問所有受保護頁仍 200（curl 已驗證：`/kanban` `/me` `/roles` `/user-roles` `/audit-logs` `/login-records` 全部 200）
- [x] viewer kanban 頁不顯示 inline 表單，卡片無 hover icons、無法拖拉（`useHasPermission` 條件渲染）
- [x] admin 改卡片狀態 → toast「卡片已移動至「{狀態}」!」（updateCard 比對 oldStatus）
- [x] admin 只改 title/description → toast「卡片已更新」
- [x] admin 同欄拖拉 reorder → 不顯示 toast（moveCard 比對 fromStatus === toStatus）
- [x] admin 跨欄拖拉 → toast「卡片已移動至…」
- [x] 手機 <640px 四欄縱向堆疊（`flex-col` + `sm:flex-row`）
- [x] 卡片 icon button 點擊區 44×44px（`h-11 w-11` = 44px Tailwind）
- [x] 狀態 emoji 顯示 📋/🚀/👀/✅
- [x] 新增卡片 toast 顯示「卡片已新增至「待處理」!」（i18n key 改用 interpolation `{{status}}`）
- [x] `npm run type:check`、`npm run lint` 全綠（lint warning 是 pre-existing 無關）

## 風險評估

- **per-page layout.tsx 在 production build 會被視為動態路由**（呼叫 `auth()` 不能 prerender），需確認 Next.js 15 不會在 build 時報錯；若會，加 `export const dynamic = 'force-dynamic'`
- **server-side hasPermission 走 prisma**，會有 DB query；但 `permission-service` 內建 5 分鐘 cache，影響應微小
- 所有 i18n 文案改動須同時更新 `zh-TW.json` 與 `en.json`，避免一邊缺 key 走 fallback

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/lib/require-permission.ts` — Write @ 2026-04-26 15:44
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/roles/layout.tsx` — Write @ 2026-04-26 15:44
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/user-roles/layout.tsx` — Write @ 2026-04-26 15:44
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/audit-logs/layout.tsx` — Write @ 2026-04-26 15:44
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/login-records/layout.tsx` — Write @ 2026-04-26 15:44
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/kanban/_lib/use-kanban-board.ts` — Edit @ 2026-04-26 15:45
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/kanban/page.tsx` — Edit @ 2026-04-26 15:45
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/kanban/_components/kanban-column.tsx` — Edit @ 2026-04-26 15:46
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/kanban/_components/kanban-card.tsx` — Edit @ 2026-04-26 15:46
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/kanban/_lib/card-status.ts` — Edit @ 2026-04-26 15:47
