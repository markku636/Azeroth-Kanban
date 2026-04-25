# Spec: Admin 全站 dark mode 卡片浮起感修正（bg-gray-0 → 補 dark:bg-gray-100）

> 建立日期: 2026-04-25
> 狀態: ✅ 已完成
> 關聯計劃書: 無（屬 Spec E 後續微調，使用者目視回報並提供參考站截圖）

---

## 目標

修正 admin 後台所有 `bg-gray-0` 容器在 dark mode 下變純黑 `#000`、與 body bg `gray-50 = #111` 對比不夠（甚至比 body 更黑）的問題；統一補上 `dark:bg-gray-100`（`#1f1f1f`）overlay，讓卡片 / 表單輸入框 / Modal 在 dark mode 比 body 略亮 0x0e 的階差，產生 hydrogen template 與使用者參考站（mgm.markkulab.net）一致的「卡片浮起」觀感。

## 背景

Spec E（20260425-005）為了修「淺灰卡片 bug」，把 `bg-white dark:bg-gray-800` 統一替換為 `bg-gray-0`。`gray-0` 在 dark mode = `#000`，比 body `gray-50 = #111` 更黑，導致：

- 卡片邊界消失、無浮起感
- 黑色 input 框在黑底頁面上看不到邊框
- Modal / Dialog 與背景融合

對照證據：
- hydrogen template 既有檔（`app/shared/modal-views/container.tsx`、`app/shared/drawer-views/container.tsx`）皆用 `dark:bg-gray-100`
- 使用者提供的參考站 mgm.markkulab.net 在 dark mode 下，卡片明顯比 body 略亮，視覺上有層次

→ 補 `dark:bg-gray-100`（`#1f1f1f`）即可對齊。

> 參考知識：Spec E（`docs/specs/completed/20260425-005-dark-mode-gray-fix.spec.md`）已釐清「HIGH-number `dark:gray-{700,800,900}` 在反轉 palette 下會變淺色」是 bug；本 Spec 補的 `dark:bg-gray-100` 屬 LOW-number，dark 端為 `#1f1f1f`（深灰），是 hydrogen 慣用的正確寫法。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 |
| `common` | ❌ | 無 |
| `admin` | ✅ | 純 Tailwind class 補丁，~17 檔 |

## 建議開發順序

1. `admin/src/lib/select-classnames.ts`（共用 select 樣式）
2. `admin/src/components/*.tsx`（共用元件）
3. `admin/src/app/admin/(dashboard)/*` 各頁面與 kanban 子元件
4. `npm run type:check`

---

## 受影響檔案

### admin（不動 layouts/sticky-header.tsx、layouts/hydrogen/sidebar.tsx、kanban-column.tsx：已正確或為小型 badge）

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/lib/select-classnames.ts` | 修改 | select control / menu `bg-gray-0` 補 `dark:bg-gray-100` |
| `admin/src/components/data-table.tsx` | 修改 | 容器 + 搜尋框 + row bg 補 dark override |
| `admin/src/components/detail-card.tsx` | 修改 | 卡片容器 |
| `admin/src/components/stats-card.tsx` | 修改 | 同上 |
| `admin/src/components/form-card.tsx` | 修改 | 卡片容器 + input bg |
| `admin/src/components/edit-modal.tsx` | 修改 | Modal panel + 取消按鈕 |
| `admin/src/components/confirm-dialog.tsx` | 修改 | 取消按鈕 |
| `admin/src/components/confirm-dialog-body.tsx` | 修改 | 取消按鈕 |
| `admin/src/components/prompt-dialog-body.tsx` | 修改 | input + 按鈕 |
| `admin/src/components/api-result-panel.tsx` | 修改 | code panel bg |
| `admin/src/components/pagination.tsx` | 修改 | 容器 + select + 頁碼按鈕 |
| `admin/src/app/admin/(dashboard)/page.tsx` | 修改 | 首頁 tile |
| `admin/src/app/admin/(dashboard)/me/page.tsx` | 修改 | 個人資料卡片（兩處） |
| `admin/src/app/admin/(dashboard)/roles/page.tsx` | 修改 | 卡片 + Modal + form input（多處） |
| `admin/src/app/admin/(dashboard)/user-roles/page.tsx` | 修改 | 卡片 + Modal |
| `admin/src/app/admin/(dashboard)/login-records/page.tsx` | 修改 | filter inputs + 卡片 |
| `admin/src/app/admin/(dashboard)/audit-logs/page.tsx` | 修改 | 同上 |
| `admin/src/app/admin/(dashboard)/kanban/_components/edit-card-modal.tsx` | 修改 | Modal + form inputs |
| `admin/src/app/admin/(dashboard)/kanban/_components/inline-card-form.tsx` | 修改 | 容器 + inputs |
| `admin/src/app/admin/(dashboard)/kanban/_components/kanban-card.tsx` | 修改 | 卡片 |

不動：

- `admin/src/layouts/sticky-header.tsx`（已有 `dark:bg-gray-50/95`）
- `admin/src/layouts/hydrogen/sidebar.tsx`（已有 `dark:bg-gray-100/5`）
- `admin/src/app/admin/(dashboard)/kanban/_components/kanban-column.tsx`（`bg-gray-0/60` 為 column header 計數 pill，小元件不需浮起）
- `admin/src/app/globals.css`（token 定義，且既有 `dark:bg-gray-100` override 已正確）

---

## 邏輯變更點

純 Tailwind class 補丁：所有 `bg-gray-0`（不含 `bg-gray-0/{n}` 透明度變體）後追加 `dark:bg-gray-100`。

替換規則：

| 來源 | 替換成 |
| --- | --- |
| `bg-gray-0`（plain） | `bg-gray-0 dark:bg-gray-100` |
| `bg-gray-0/{n}`（透明度變體） | 不動 |

每個檔內若無透明度變體，可用 `replace_all`；若有混用則需逐筆處理（本次列表的檔案都不混用）。

無業務邏輯異動。

## 回滾計劃

1. `git diff` 還原所有 admin/src 檔案。
2. 純 className 變更，無資料層或行為變更。

## 預期測試結果

- [x] `npm run type:check` 通過（純 class 補丁）— 2026-04-25 跑完無 error
- [ ] dark mode 下卡片 / Modal / input 背景為 `#1f1f1f`，比 body bg `#111` 略亮、有浮起感（待使用者目視驗證）
- [ ] light mode 下無 regression（`bg-gray-0` 仍為白底）（待使用者目視驗證）
- [ ] `/admin/me`、`/admin/login-records`、`/admin/audit-logs`、`/admin/roles`、`/admin/user-roles`、`/admin/kanban` 目視驗證

## 風險評估

- 部分元件（如 `data-table.tsx:243` row bg `bg-gray-0`）原本 dark 端是純黑，補 `dark:bg-gray-100` 後 row 與外層 container 同色（都 `#1f1f1f`）→ 沒變壞，因為 row 本來就會 hover 變色，靜態時與 container 同色屬可接受層級
- `kanban-card.tsx` 卡片改後與 column body bg（`bg-{color}-50/40` 類）對比關係改變，需目視確認
- 不動 `layouts/*` 與 `globals.css`，避免影響 RizzUI sidebar / header 行為

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## AI 協作紀錄

### 目標確認

使用者於 `/admin/me` 截圖回報 dark mode 觀感不對 → 進一步提供參考站 mgm.markkulab.net 三張截圖，要求全站 dark mode 對齊（卡片比 body 略亮的浮起感）→ Spec scope 從單頁擴大為全 admin。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 補 `dark:bg-gray-100` overlay 至所有 `bg-gray-0` | ✅ 採納 | 對齊 hydrogen template `modal-views/container.tsx` 等既有寫法與使用者參考站 |
| 改 globals.css 把 `--gray-0` 在 dark 改成 `#1f1f1f` | ❌ 棄用 | Spec E 明確禁止改 globals.css，且影響範圍不可控（任何用 `gray-0` 的地方都會跟著變） |
| 改 body bg 從 `dark:bg-gray-50` 改成 `dark:bg-gray-0` 加大對比 | ❌ 棄用 | 同上，動到 globals.css；且 RizzUI sidebar/header 配色依賴 body 為 `#111` |
| 也補 form input、modal、pagination 等小元件 | ✅ 採納 | 黑色 input 在黑底頁面上看不到邊界，全站一致才完整 |
| 連 `kanban-column.tsx` 的 `bg-gray-0/60` 計數 pill 一併改 | ❌ 棄用 | 透明度變體與 column 自有 bg 疊色，且為小型 badge，不適用「卡片浮起」原則 |

### 產出摘要

**完成範圍（2026-04-25）**：

- 共修改 **20 檔 / 63 處** `bg-gray-0` → `bg-gray-0 dark:bg-gray-100`：
  - lib（1）：`select-classnames.ts`
  - components（10）：`api-result-panel`、`confirm-dialog`、`confirm-dialog-body`、`data-table`、`detail-card`、`edit-modal`、`form-card`、`pagination`、`prompt-dialog-body`、`stats-card`
  - admin pages（9）：`(dashboard)/page`、`me`、`roles`、`user-roles`、`login-records`、`audit-logs`、`kanban/_components/edit-card-modal`、`inline-card-form`、`kanban-card`
- **未動範圍**：`layouts/sticky-header.tsx`（已有 `dark:bg-gray-50/95`）、`layouts/hydrogen/sidebar.tsx`（已有 `dark:bg-gray-100/5`）、`kanban/_components/kanban-column.tsx`（`bg-gray-0/60` 透明度變體）、`globals.css`（token 定義）、`admin/login/page.tsx`（已有 `dark:bg-gray-100/200` 正確 override）
- **驗證**：`npm run type:check` 通過、`grep "bg-gray-0(?! dark:bg-gray-100)(?!/)"` 無殘留

**慣例補充（更新 Spec E 的設計慣例）**：

本專案 RizzUI hydrogen 風格的卡片配色，在 dark mode 需要 `dark:bg-gray-100`（`#1f1f1f`）才有「浮起感」，因為 body bg = `gray-50 = #111`。單純依靠 `bg-gray-0` auto-flip 會變純黑 `#000` 比 body 更黑，視覺上卡片消失。

對應的完整慣例：

- ✅ 卡片底 / 表單輸入 / Modal panel：`bg-gray-0 dark:bg-gray-100`
- ✅ 文字：`text-gray-{500,700,900}`（auto-flip）
- ✅ 邊框：`border-gray-{200,300}`（auto-flip）
- ✅ 表頭 / 區塊 bg：`bg-gray-{50,100}`（auto-flip）
- ❌ 切勿用 HIGH 編號 `dark:bg-gray-{700,800,900}`（dark 端反轉成淺色）

> 此為 Spec E（auto-flip palette）的補充慣例，建議提煉至 `docs/knowledge/patterns/auto-inverting-gray-palette.md`（若已存在則更新）。
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/me/page.tsx` — Edit @ 2026-04-25 10:21
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/lib/select-classnames.ts` — Edit @ 2026-04-25 10:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/data-table.tsx` — Edit @ 2026-04-25 10:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/detail-card.tsx` — Edit @ 2026-04-25 10:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/stats-card.tsx` — Edit @ 2026-04-25 10:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/form-card.tsx` — Edit @ 2026-04-25 10:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/edit-modal.tsx` — Edit @ 2026-04-25 10:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/confirm-dialog.tsx` — Edit @ 2026-04-25 10:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/confirm-dialog-body.tsx` — Edit @ 2026-04-25 10:22
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/prompt-dialog-body.tsx` — Edit @ 2026-04-25 10:23
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/api-result-panel.tsx` — Edit @ 2026-04-25 10:23
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/components/pagination.tsx` — Edit @ 2026-04-25 10:23
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/page.tsx` — Edit @ 2026-04-25 10:23
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/roles/page.tsx` — Edit @ 2026-04-25 10:23
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/user-roles/page.tsx` — Edit @ 2026-04-25 10:23
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/login-records/page.tsx` — Edit @ 2026-04-25 10:23
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/audit-logs/page.tsx` — Edit @ 2026-04-25 10:24
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/kanban/_components/edit-card-modal.tsx` — Edit @ 2026-04-25 10:24
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/kanban/_components/inline-card-form.tsx` — Edit @ 2026-04-25 10:24
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/kanban/_components/kanban-card.tsx` — Edit @ 2026-04-25 10:24
