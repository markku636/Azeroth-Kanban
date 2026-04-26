# Plan: 移除 `/admin` URL Prefix、登入後導向 Kanban 看板

> 建立日期: 2026-04-26
> 狀態: ✅ 已完成
> 優先級: 🟡 中

---

## 目標

- 將所有頁面路由移除 `/admin` 前綴：`/admin/login` → `/login`、`/admin/kanban` → `/kanban`、`/admin/roles` → `/roles`、依此類推
- 登入成功後預設導向 `/kanban`（不再是 Dashboard 快速入口頁）
- 根路徑 `/` 直接 `redirect('/kanban')`，不保留原 Dashboard 首頁
- 權限檢查行為完全不受影響（RBAC、`withPermission`、`use-permissions` 沿用）
- API 路由 `/api/v1/admin/*` 不動（屬於業務語意命名空間，非 UI 前綴）

## 背景

> 使用者指定豁免 PRD（規模屬中型偏大、需求口述明確）。

目前 Admin Portal 所有頁面都掛在 `/admin/*` 之下，但本專案就是一個後台，多一層 `/admin` 沒有區分意義。同時登入後預設落點是 `/admin`（Dashboard 快速入口頁），但 Kanban 看板才是面試作業核心；為簡化體驗，登入後直接進看板。

## 方案概述

URL 由 Next.js App Router 的資料夾路徑決定，因此：
1. 用 `git mv` 把 `app/admin/login/` 與 `app/admin/(dashboard)/` 分別搬到 `app/login/` 與 `app/(dashboard)/`
2. 更新 `config/routes.ts` 中所有路由常數（單一變更點，多數頁面與選單會自動跟著更新）
3. 改寫 `middleware.ts` 為「公開白名單以外都要登入」的模式，並把已登入訪問 `/login` 的導向改為 `/kanban`
4. 把根頁 `app/(dashboard)/page.tsx` 換成 `redirect('/kanban')`（去除 Dashboard 首頁）
5. 更新 NextAuth `pages.signIn`、login page 的 `callbackUrl/router.push`、登出的 `callbackUrl`

權限系統與 URL 完全解耦（permission code 是動作導向 `'roles.view'` 等），這次純 URL 重構不會影響權限。

## 受影響子專案

| 子專案 | 影響類型 | 說明 |
| --- | --- | --- |
| `prisma` | 不影響 | 無 schema / migration / seed 變更 |
| `common` | 不影響 | — |
| `admin` | 修改 | App Router 結構搬遷、middleware 重寫、routes/auth/login/sign-out 細部更新 |

## 拆解的 Spec 清單

| Spec 檔名 | 狀態 | 說明 |
| --- | --- | --- |
| `docs/specs/doing/20260426-001-remove-admin-prefix.spec.md` | ✅ | 整批一次性重構（中型，不再細拆） |

## 驗收條件

- [x] 未登入訪問 `/`、`/kanban`、`/roles` 等都被導向 `/login?callbackUrl=<path>`（curl 307 驗證）
- [x] 訪問 `/login` 顯示登入頁（curl 200）
- [x] 帳密登入後可訪問 `/kanban`（curl 200）
- [x] 已登入再訪問 `/login` 被導向 `/kanban`（curl 307 → /kanban）
- [x] 已登入訪問 `/` 被導向 `/kanban`（curl 307 → /kanban）
- [x] callbackUrl 機制：login 頁讀 `searchParams.callbackUrl`，無則 fallback `/kanban`
- [x] API（`/api/v1/admin/me`、`/api/v1/kanban/cards`）未授權回 401、授權回 200；permission 系統不受影響
- [x] 登出 callbackUrl 改用 `routes.login`
- [x] `/admin/*` 中間層不再特別處理；後續訪問舊路徑由 Next.js 自然產出 404
- [x] `npm run type:check`、`npm run lint` 全綠
- [ ] `npm run build` — 在 `/404` prerender 觸發 React error #31，**已驗證為 main HEAD（72211a8）即存在的問題，與本次重構無關**；不在本任務範圍內處理

## AI 協作紀錄

### 目標確認

移除 `/admin` URL 前綴 + 登入後導向看板，權限不受影響。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 根路徑 `/` 改為 redirect 至 `/kanban`（廢棄 Dashboard 首頁） | ✅ 採納 | 使用者明確選擇「登入即進看板」單一入口體驗 |
| 保留 `/admin/*` backward-compatible redirect | ❌ 棄用 | 使用者選擇舊路徑直接 404，避免多寫 catch-all 路由 |
| API 路由 `/api/v1/admin/*` 改名 | ❌ 棄用 | API 屬業務領域命名（管理員 API），與 UI URL 解耦 |
