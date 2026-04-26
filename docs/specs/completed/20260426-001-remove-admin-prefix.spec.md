# 移除 `/admin` URL Prefix、登入後導向 Kanban

> 建立日期: 2026-04-26
> 狀態: ✅ 已完成
> 關聯計劃書: docs/plans/doing/20260426-001-remove-admin-prefix.md

---

## 目標

把整個 Admin Portal 的頁面路由移除 `/admin` 前綴，登入成功後預設導向 `/kanban`，根路徑 `/` 重新導向 `/kanban`。權限檢查行為完全不變，API 路由不動。

## 背景

URL 多一層 `/admin` 在這個只有單一後台的面試作業中沒有意義；同時看板才是核心，登入應直接進看板。權限系統 (`withPermission` / `use-permissions` / RBAC) 與 URL 解耦，本次不需要改動。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 |
| `common` | ❌ | 無 |
| `admin` | ✅ | App Router 資料夾搬遷、middleware 重寫、routes/auth/login/sign-out 局部更新 |

## 建議開發順序

1. `admin` — 全部變更集中在 admin 子專案

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/admin/login/page.tsx` | 移動 → `admin/src/app/login/page.tsx` 並修改 | 修改 callbackUrl / router.push 改用 `routes.kanban`；支援 `searchParams.callbackUrl` 優先 |
| `admin/src/app/admin/(dashboard)/layout.tsx` | 移動 → `admin/src/app/(dashboard)/layout.tsx` | 純搬遷，內容不變 |
| `admin/src/app/admin/(dashboard)/page.tsx` | 移動 → `admin/src/app/(dashboard)/page.tsx` 並改寫 | 整檔換成 `redirect('/kanban')` |
| `admin/src/app/admin/(dashboard)/kanban/page.tsx` | 移動 → `admin/src/app/(dashboard)/kanban/page.tsx` | 純搬遷 |
| `admin/src/app/admin/(dashboard)/kanban/_components/*` | 隨資料夾搬遷 | 純搬遷 |
| `admin/src/app/admin/(dashboard)/roles/page.tsx` | 移動 → `admin/src/app/(dashboard)/roles/page.tsx` | 純搬遷 |
| `admin/src/app/admin/(dashboard)/user-roles/page.tsx` | 移動 → `admin/src/app/(dashboard)/user-roles/page.tsx` | 純搬遷 |
| `admin/src/app/admin/(dashboard)/audit-logs/page.tsx` | 移動 → `admin/src/app/(dashboard)/audit-logs/page.tsx` | 純搬遷 |
| `admin/src/app/admin/(dashboard)/login-records/page.tsx` | 移動 → `admin/src/app/(dashboard)/login-records/page.tsx` | 純搬遷 |
| `admin/src/app/admin/(dashboard)/me/page.tsx` | 移動 → `admin/src/app/(dashboard)/me/page.tsx` | 純搬遷 |
| `admin/src/config/routes.ts` | 修改 | 移除 8 個路由常數的 `/admin` 前綴；`dashboard` 設為 `/kanban` |
| `admin/src/middleware.ts` | 修改 | 改寫為白名單模式；已登入訪問 `/login` 導向 `/kanban` |
| `admin/src/auth.ts` | 修改 | `pages.signIn` 改為 `/login` |
| `admin/src/lib/api-client.ts` | 修改 | session 過期 `signOut callbackUrl` 改用 `routes.login` |
| `admin/src/layouts/profile-menu.tsx` | 修改 | 登出按鈕 `signOut callbackUrl` 改用 `routes.login` |

> Sidebar (`menu-items.tsx`)、Search palette (`page-links.data.ts`)、Messages dropdown (`messages-dropdown.tsx`) 都透過 `routes.*` 引用，會自動跟著更新，不需手動修改。

---

## 邏輯變更點

### admin

- `config/routes.ts`：路由常數值改為去前綴版本；`adminRoutes.dashboard` 由 `/admin` 改為 `/kanban`，這樣 sidebar logo / messages dropdown 連結（用 `routes.dashboard`）也會自動指向看板
- `middleware.ts`：邏輯由「`startsWith('/admin')` 才保護」改為「白名單 `/login` 以外一律要登入；未登入導 `/login?callbackUrl=...`；已登入訪問 `/login` 導 `/kanban`」
- `auth.ts`：`pages.signIn: '/login'`
- `app/login/page.tsx`：使用 `useSearchParams()` 取 `callbackUrl`，若無則回退 `routes.kanban`；`signIn` 與 `router.push` 都用該值
- `app/(dashboard)/page.tsx`：整檔換成 `import { redirect } from 'next/navigation'; export default function HomePage() { redirect('/kanban'); }`
- `lib/api-client.ts` / `layouts/profile-menu.tsx`：sign-out callbackUrl 改用 `routes.login` 常數，避免硬編碼

## 資料表異動

無。

## API 合約

無 API 變更。

## 回滾計劃

1. `git revert` 此次 commit
2. （無 DB 變更，不需 down migration）

## 預期測試結果

- [x] 未登入訪問 `/`、`/kanban`、`/roles` 都被導到 `/login?callbackUrl=<path>`（curl 驗證 307）
- [x] 訪問 `/login` 顯示登入頁（curl 驗證 200）
- [x] 帳密登入後 GET `/kanban` 回 200；`/api/v1/admin/me` 帶 session 回 200
- [x] 已登入訪問 `/login` 與 `/` 都被導向 `/kanban`（curl 驗證 307 → /kanban）
- [x] callbackUrl middleware 機制保留（登入頁讀 `searchParams.callbackUrl`，未提供時 fallback `/kanban`）
- [x] API `/api/v1/admin/me` 與 `/api/v1/kanban/cards` 未授權回 401，授權後回 200（permission 系統不受影響）
- [x] 已登入訪問 `/login` 自動導向 `/kanban`，登出 callbackUrl 改用 `routes.login`
- [x] middleware 不再針對 `/admin/*` 做 prefix 處理；舊路徑現在交由 Next.js 自然 404
- [x] `npm run type:check`、`npm run lint` 全綠
- [ ] `npm run build` — 在 `/404` prerender 階段拋 React error #31，**已驗證為 main HEAD（72211a8）即存在的問題，與本次重構無關**；不在本任務範圍內處理

## 風險評估

- 舊書籤 / 既有連結將失效（已決策接受）
- Dashboard 首頁的快速入口被廢棄，使用者僅能透過 sidebar 導航（已決策接受）
- middleware matcher 仍排除 `api/v1` 與 `api/auth`，API 路由不會被白名單邏輯影響

---

## 實際變更

<!-- PostToolUse Hook 自動追加 Edit/Write 的檔案路徑 -->
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/config/routes.ts` — Write @ 2026-04-26 10:54
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/middleware.ts` — Write @ 2026-04-26 10:54
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/auth.ts` — Edit @ 2026-04-26 10:54
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/login/page.tsx` — Edit @ 2026-04-26 10:55
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/page.tsx` — Write @ 2026-04-26 10:55
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/lib/api-client.ts` — Edit @ 2026-04-26 10:55
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/layouts/profile-menu.tsx` — Edit @ 2026-04-26 10:56
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/not-found.tsx` — Write @ 2026-04-26 11:02
