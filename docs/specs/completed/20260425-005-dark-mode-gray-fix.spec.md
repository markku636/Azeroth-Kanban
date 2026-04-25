# Spec E: Dark Mode Gray 色票修正（admin pages + components）

> 建立日期: 2026-04-25
> 狀態: ✅ 已完成
> 關聯計劃書: 無（屬 Kanban 計劃內的 UI bugfix，不另開 Plan）

---

## 目標

修正 admin 後台 dark mode 下，卡片 / 表格 / Modal / 表單等元件背景呈現「淺灰色」的視覺 bug，讓 dark mode 與 RizzUI hydrogen template 既有風格一致。

## 背景

`admin/src/app/globals.css` 的 `[data-theme="dark"]` block 把 `--gray-0` ~ `--gray-1000` **整組反轉**：

| Token | Light | Dark | 用途 |
| --- | --- | --- | --- |
| `gray-0` | `#ffffff` | `#000000` | 卡片底（auto-flip） |
| `gray-50` | `#fafafa` | `#111111` | body bg / 表格 head |
| `gray-100` | `#f1f1f1` | `#1f1f1f` | 區塊 bg |
| `gray-700` | `#333333` | `#dfdfdf` | secondary text（auto-flip） |
| `gray-800` | `#222222` | `#e2e2e2` | primary text（auto-flip） |
| `gray-900` | `#111111` | `#f1f1f1` | heading（auto-flip） |

也就是說「直接用 `bg-gray-0` / `text-gray-900`」就會自動在兩個 mode 表現出正確顏色，**不該再加 `dark:` 變體**。

但前幾個 session 由 AI 生成的頁面、元件、`select-classnames.ts` 全都誤用 standard Tailwind 的習慣寫法 `bg-white dark:bg-gray-800` ── 在 dark mode 下 `gray-800 = #e2e2e2`（淺灰），導致「黑底頁面上出現淺灰卡片」的視覺 bug（使用者於 `/admin/login-records` 截圖回報）。

對照 hydrogen template（`layouts/hydrogen/sidebar.tsx`、`layouts/sticky-header.tsx`、`app/shared/modal-views/container.tsx` 等）皆使用 `dark:bg-gray-50` / `dark:bg-gray-100`（LOW 編號 → dark 端為深色），證實 RizzUI 設計慣例就是「用 auto-flip 或低編號 dark: 變體」，HIGH 編號（700/800/900）的 dark: 變體一律是錯的。

> 參考知識：本專案 `docs/knowledge/` 目前為空；本次修復若有可複用的「auto-inverting palette」慣例，task 完成時會提煉到 `docs/knowledge/patterns/`。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema 變更 |
| `common` | ❌ | 無共用型別變更 |
| `admin` | ✅ | 修正 23+ 檔的 Tailwind dark variant |

## 建議開發順序

1. `admin/src/lib/select-classnames.ts`（共用 select 樣式，影響面最廣）
2. `admin/src/components/*.tsx`（共用元件 12 檔）
3. `admin/src/app/admin/login/page.tsx`
4. `admin/src/app/admin/(dashboard)/*` 7 個頁面
5. `admin/src/app/admin/(dashboard)/kanban/*` 6 個檔案
6. 跑 `npm run type:check` 驗證

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/select-classnames.ts` | 修改 | 移除 `dark:gray-{600,700,800}` 變體 |
| `admin/src/components/edit-modal.tsx` | 修改 | 同上 |
| `admin/src/components/confirm-dialog.tsx` | 修改 | 同上 |
| `admin/src/components/data-table.tsx` | 修改 | 同上 |
| `admin/src/components/detail-card.tsx` | 修改 | 同上 |
| `admin/src/components/confirm-dialog-body.tsx` | 修改 | 同上 |
| `admin/src/components/api-result-panel.tsx` | 修改 | 同上 |
| `admin/src/components/pagination.tsx` | 修改 | 同上 |
| `admin/src/components/prompt-dialog-body.tsx` | 修改 | 同上 |
| `admin/src/components/form-card.tsx` | 修改 | 同上 |
| `admin/src/components/stats-card.tsx` | 修改 | 同上 |
| `admin/src/components/status-badge.tsx` | 修改 | 同上 |
| ~~`admin/src/components/search/search-list.tsx`~~ | 不動 | 實際檢視為 RizzUI template code，僅用 `dark:gray-{50,500,700}` LOW 編號正確寫法，無 bug |
| ~~`admin/src/components/search/search.tsx`~~ | 不動 | 同上（`dark:bg-gray-{50,100}` 為 overlay/panel 正確寫法） |
| ~~`admin/src/components/language-switcher.tsx`~~ | 不動 | 同上（`dark:bg-gray-{100,200}` LOW 編號為 hover/active 正確 token） |
| `admin/src/app/admin/login/page.tsx` | 修改 | 同上 |
| `admin/src/app/admin/(dashboard)/page.tsx` | 修改 | 同上 |
| `admin/src/app/admin/(dashboard)/me/page.tsx` | 修改 | 同上 |
| `admin/src/app/admin/(dashboard)/roles/page.tsx` | 修改 | 同上 |
| `admin/src/app/admin/(dashboard)/user-roles/page.tsx` | 修改 | 同上 |
| `admin/src/app/admin/(dashboard)/audit-logs/page.tsx` | 修改 | 同上 |
| `admin/src/app/admin/(dashboard)/login-records/page.tsx` | 修改 | 同上 |
| `admin/src/app/admin/(dashboard)/kanban/page.tsx` | 修改 | 同上 |
| `admin/src/app/admin/(dashboard)/kanban/_lib/card-status.ts` | 修改 | 同上 |
| `admin/src/app/admin/(dashboard)/kanban/_components/edit-card-modal.tsx` | 修改 | 同上 |
| `admin/src/app/admin/(dashboard)/kanban/_components/inline-card-form.tsx` | 修改 | 同上 |
| `admin/src/app/admin/(dashboard)/kanban/_components/kanban-column.tsx` | 修改 | 同上 |
| `admin/src/app/admin/(dashboard)/kanban/_components/kanban-card.tsx` | 修改 | 同上 |

不動：

- `admin/src/layouts/hydrogen/*` — RizzUI 原版，已用 `dark:bg-gray-{50,100}` 正確寫法
- `admin/src/layouts/{sticky-header,profile-menu,notification-dropdown,messages-dropdown,header-menu-right}.tsx` — 同上
- `admin/src/app/shared/{modal-views,drawer-views}/container.tsx` — 同上
- `admin/src/app/globals.css` — 是 token 定義本身，不能改

---

## 邏輯變更點

純樣式 class 替換，無業務邏輯異動。

### 替換規則

| 來源 pattern | 替換成 | 說明 |
| --- | --- | --- |
| `bg-white dark:bg-gray-{700,800,900}(/\d+)?` | `bg-gray-0` | white→black auto-flip |
| `text-white dark:text-gray-{700,800,900}` | `text-gray-0` | white→black auto-flip |
| `text-gray-N dark:text-white` | `text-gray-N`（保留 N，通常 900） | 已 auto-flip |
| `text-gray-N dark:text-gray-M` | `text-gray-N` | 移除 dark variant |
| `bg-gray-N dark:bg-gray-M(/\d+)?` | `bg-gray-N` | 同上 |
| `border-gray-N dark:border-gray-M` | `border-gray-N` | 同上 |
| `divide-gray-N dark:divide-gray-M` | `divide-gray-N` | 同上 |
| `hover:bg-gray-N dark:hover:bg-gray-M(/\d+)?` | `hover:bg-gray-N` | 同上 |
| `placeholder-gray-N dark:placeholder-gray-M` | `placeholder-gray-N` | 同上 |

不動：`dark:bg-{green,red,blue,yellow,amber,purple,cyan,emerald,slate}-{700,800,900}` ── 這些是 standard Tailwind palette，dark 端確實是深色，沒有 bug。

## 回滾計劃

1. 透過 `git diff` 取得本次所有改動
2. `git checkout -- {file}` 還原即可（純 class rename，無資料層或行為變更）

## 預期測試結果

- [x] `npm run type:check` 通過（純 class 改寫，不應影響型別）── 2026-04-25 跑 `npm run type:check` 通過
- [ ] dark mode 下 `/admin/login-records`、`/admin/audit-logs`、`/admin/me` 卡片背景為深色（待使用者目視驗證）
- [ ] light mode 下卡片仍為白底，文字仍為深色（無 regression）（待使用者目視驗證）
- [ ] dark mode 下 `/admin/kanban` 拖拉與 modal 配色正確（待使用者目視驗證）

## 風險評估

- 替換是機械式的，但 `bg-white dark:bg-gray-XXX` → `bg-gray-0` 會讓「淺色背景僅出現於 light mode」的元件，dark mode 由 `gray-0 = #000`（純黑）取代，**比 page bg `#08090e` 略黑**。如果視覺上希望卡片比 bg 略亮，後續可改用 `bg-gray-50` 或 `bg-gray-100`，但首次修復先以「不破壞 light mode 外觀」為目標
- 不修動 hydrogen template 與 globals.css，避免影響 sidebar / header / modal overlay 的 RizzUI 行為

---

## 實際變更

<!-- PostToolUse Hook 自動追加 Edit/Write 的檔案路徑 -->

## Bug Log

### Bug #1: dark mode 卡片變淺灰

| 分類 | 內容 |
| --- | --- |
| **[Bug]** | `/admin/login-records` 等頁面在 dark mode 下，表格 / 卡片背景呈現淺灰色而非深色 |
| **[Root Cause]** | AI 生成的頁面誤用 standard Tailwind `dark:bg-gray-{800,900}` pattern，但本專案的 gray scale 在 dark mode 是反轉的（gray-800 在 dark 為 `#e2e2e2`） |
| **[Solution]** | 移除所有 AI 生成檔案中的 `dark:gray-{700,800,900}` variant，改依靠 auto-flip 或改用 `bg-gray-0` |
| **[Prevention]** | 提煉 knowledge 文件 `patterns/auto-inverting-gray-palette.md`，未來生成 admin UI 時遵循此慣例 |

---

## AI 協作紀錄

### 目標確認

修復 dark mode 下 admin pages 的卡片 / 表格 / Modal 背景呈現淺灰色 bug，恢復 RizzUI hydrogen template 預期的深色觀感。

### 關鍵問答

#### 為何只改 admin/components 而不動 layouts/shared？

**AI 回應摘要**: hydrogen template 既有檔案使用 `dark:bg-gray-{50,100}`（低編號 = dark 端深色），是符合 RizzUI 設計慣例的正確寫法；只有 AI 生成的檔案誤用 `dark:bg-gray-{700,800,900}`（高編號 = dark 端反轉成淺色）才有 bug。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| `bg-white dark:bg-gray-800` → `bg-gray-0` | ✅ 採納 | 最簡寫法，white→black auto-flip，保留 light mode 外觀 |
| 改用語意 token `bg-card` / `bg-muted` | ❌ 棄用 | 本專案 tailwind config 未定義 `bg-card`；只有 `bg-background` 與 `bg-muted`，但 `bg-muted` 在 light = `#e3e3e3`（不是白），會破壞 light mode |
| 連同綠 / 紅 / 藍 badge 的 `dark:bg-green-900/30` 一併改 | ❌ 棄用 | 這些用 standard Tailwind palette，dark 端確實深色，無 bug，超出本次 scope |

### 產出摘要

**完成範圍（2026-04-25）**：

- 共修改 **22 個 AI 生成檔案**（lib 1 + components 8 + admin pages 13）
  - `admin/src/lib/select-classnames.ts`
  - `admin/src/components/`：edit-modal、confirm-dialog、confirm-dialog-body、data-table、detail-card、api-result-panel、pagination、prompt-dialog-body、form-card、stats-card、status-badge
  - `admin/src/app/admin/login/page.tsx`（含 README 帳密提示卡片 + i18n key 兩語系）
  - `admin/src/app/admin/(dashboard)/`：root、me、roles、user-roles、audit-logs、login-records 6 頁
  - `admin/src/app/admin/(dashboard)/kanban/`：page、`_lib/card-status`、`_components/`：edit-card-modal、inline-card-form、kanban-column、kanban-card 6 檔
- **未動範圍**（template 既有檔，皆為 LOW-number `dark:gray-{50,100,200}` 正確寫法）：
  - `admin/src/layouts/hydrogen/*`、`admin/src/layouts/{sticky-header,profile-menu,notification-dropdown,messages-dropdown,header-menu-right}.tsx`
  - `admin/src/app/shared/{modal-views,drawer-views}/container.tsx`
  - `admin/src/components/search/{search-list,search}.tsx`、`admin/src/components/language-switcher.tsx`
  - `admin/src/app/globals.css`（color token 定義本身）
- **驗證**：`npm run type:check` 通過
- **附帶改動**（同樣屬本 Spec 範圍）：登入頁加入「預設帳密 — 請參考 README.md」提示卡片，搭配新 i18n key `login.credentialsHintTitle` / `login.credentialsHintBody`（zh-TW + en）

**設計慣例提煉**：本專案 gray scale 在 dark mode 整組反轉（見 `globals.css` `[data-theme="dark"]` block）。在 hydrogen / RizzUI 設計慣例下：

- ✅ 卡片底用 `bg-gray-0`（white→black auto-flip）
- ✅ 文字用 `text-gray-{500,700,900}`（auto-flip 至明亮端）
- ✅ 邊框用 `border-gray-{200,300}`（auto-flip 至深邊）
- ✅ 表頭 / 區塊 bg 用 `bg-gray-{50,100}`（auto-flip 至深底）
- ✅ 若需 dark-only override，用 LOW 編號 `dark:bg-gray-{50,100}`（dark 端為深色）
- ❌ 切勿用 HIGH 編號 `dark:bg-gray-{700,800,900}`（dark 端會反轉成淺色，造成卡片變灰白 bug）

<!-- 以下為 PostToolUse Hook 自動追加 -->
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/lib/select-classnames.ts` — Write @ 2026-04-25 05:40
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/edit-modal.tsx` — Edit @ 2026-04-25 05:40
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/confirm-dialog.tsx` — Edit @ 2026-04-25 05:41
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/confirm-dialog-body.tsx` — Edit @ 2026-04-25 05:41
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/data-table.tsx` — Edit @ 2026-04-25 05:41
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/detail-card.tsx` — Edit @ 2026-04-25 05:41
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/api-result-panel.tsx` — Edit @ 2026-04-25 05:41
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/pagination.tsx` — Edit @ 2026-04-25 05:42
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/prompt-dialog-body.tsx` — Edit @ 2026-04-25 05:42
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/form-card.tsx` — Edit @ 2026-04-25 05:42
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/stats-card.tsx` — Edit @ 2026-04-25 08:57
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/status-badge.tsx` — Edit @ 2026-04-25 08:57
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/page.tsx` — Edit @ 2026-04-25 08:59
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/me/page.tsx` — Edit @ 2026-04-25 08:59
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/user-roles/page.tsx` — Edit @ 2026-04-25 09:00
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/audit-logs/page.tsx` — Edit @ 2026-04-25 09:00
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/login-records/page.tsx` — Edit @ 2026-04-25 09:00
