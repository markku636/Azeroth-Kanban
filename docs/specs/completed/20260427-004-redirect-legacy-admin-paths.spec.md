# 舊 /admin/* 路徑導回首頁 + 美化 404 頁

> 建立日期: 2026-04-27
> 狀態: ✅ 已完成
> 關聯計劃書: 無

---

## 目標

1. 舊版 `/admin/login`（以及任何 `/admin/*` 子路徑）已於 commit `3578db3` 移除前綴，目前直接訪問會 404。透過 Next.js `redirects()` 設定，將 `/admin/:path*` 永久導回 `/`，由 middleware 依登入狀態再分流到 `/login` 或 `/kanban`。
2. 既有的 Next.js 預設 404 頁面（黑底灰字、極小字體）視覺上與專案不符，新增 `admin/src/app/not-found.tsx` 客製化 404 頁，與 Login 頁採同一套漸層背景 + 卡片 + Logo 風格。

## 背景

3578db3 將 `/admin/kanban` → `/kanban`、`/admin/login` → `/login` 等所有頁面移出 `/admin/*`。使用者書籤、外部連結、瀏覽器歷史中仍可能保有舊網址。即便加上 redirect，仍可能有未涵蓋的死網址（例：`/foo`、線上佈署版本尚未生效）→ 預設 404 太醜，需客製化。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | — |
| `common` | ❌ | — |
| `admin` | ✅ | 在 `next.config.js` 加上 `redirects()` 把 `/admin` 與 `/admin/:path*` 永久導回 `/` |

## 建議開發順序

1. `admin` — 修改 `next.config.js` 新增 `redirects()`

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/next.config.js` | 修改 | 新增 `redirects()` 函式，將 `/admin` 與 `/admin/:path*` 以 308 永久導回 `/` |
| `admin/src/app/not-found.tsx` | 新增 | 客製化 404 頁，採用 Login 頁一致的漸層背景 + 卡片 + Logo 風格，提供回首頁 CTA |

---

## 邏輯變更點

- `admin/next.config.js`：在 `nextConfig` 物件加上 `async redirects()`，回傳兩條規則
  - `{ source: "/admin", destination: "/", permanent: true }`
  - `{ source: "/admin/:path*", destination: "/", permanent: true }`
- 後續流程由 `middleware.ts` 處理：未登入導向 `/login`，已登入導向 `/kanban`

## 回滾計劃

1. 從 `admin/next.config.js` 移除 `redirects()` 函式即可

## 預期測試結果

- [ ] 直接訪問 `/admin/login` → 308 → `/` → middleware 再導向 `/login`（未登入）或 `/kanban`（已登入）
- [ ] 訪問 `/admin` → 308 → `/`
- [ ] 訪問 `/admin/kanban`、`/admin/me` 等任意子路徑 → 308 → `/`
- [ ] 既有 `/login`、`/kanban` 等新路徑不受影響

## 風險評估

- 308 是永久重導，瀏覽器會快取。若日後想還原 `/admin/*` 路徑，使用者瀏覽器仍會走快取規則 → 風險低（本專案已無 `/admin/*` 頁面）

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

使用者要求：舊網址 `http://localhost:3010/admin/login` 因路徑修正後已無效，希望導回首頁。

### 產出摘要

- `next.config.js` 新增 `redirects()`，把 `/admin` 與 `/admin/:path*` 永久 308 導回 `/`

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/next.config.js` — Edit @ 2026-04-27 13:57
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/not-found.tsx` — Write @ 2026-04-27 14:02
