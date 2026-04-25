# Spec: /admin/me 頁面 dark mode 卡片浮起感修正

> 建立日期: 2026-04-25
> 狀態: 🔵 開發中
> 關聯計劃書: 無（屬 Spec E 後續微調，使用者目視回報）

---

## 目標

修正 `/admin/me` 個人資料頁面在 dark mode 下卡片背景與 body 對比不夠（`bg-gray-0` 在 dark = `#000000`，body 為 `gray-50 = #111111`，卡片比 body 還黑），改用 hydrogen template 慣例的 `bg-gray-0 dark:bg-gray-100`，讓卡片在 dark mode 略亮於 body 產生浮起感。

## 背景

Spec E（20260425-005）為了修「淺灰卡片 bug」，把 `bg-white dark:bg-gray-800` 統一替換為 `bg-gray-0`，結果在 dark mode 下卡片變純黑 `#000`，比 body bg `#111` 更暗，視覺上卡片消失沒有浮起層次。

對照 hydrogen template 既有用法：
- `app/shared/modal-views/container.tsx`: `dark:bg-gray-100`
- `app/shared/drawer-views/container.tsx`: `dark:bg-gray-100`
- `layouts/hydrogen/sidebar.tsx`: `dark:bg-gray-100/50`

→ RizzUI hydrogen 的卡片/面板慣例是 light 用 `bg-gray-0` (white)，dark 用 `dark:bg-gray-100` (`#1f1f1f`)，比 body `gray-50 (#111)` 略亮。

> 參考知識：Spec E（`docs/specs/completed/20260425-005-dark-mode-gray-fix.spec.md`）已記錄 auto-flip palette 慣例，本 Spec 補充「卡片需 `dark:bg-gray-100` overlay 才有浮起感」的後續發現。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 |
| `common` | ❌ | 無 |
| `admin` | ✅ | 1 檔 Tailwind class 微調 |

## 建議開發順序

1. `admin/src/app/admin/(dashboard)/me/page.tsx` 加 `dark:bg-gray-100`

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/admin/(dashboard)/me/page.tsx` | 修改 | 卡片 `<div>` 加 `dark:bg-gray-100`（含「載入失敗」與資料卡片兩處） |

---

## 邏輯變更點

純樣式：

- 載入失敗卡片 className 加 `dark:bg-gray-100`
- 個人資料卡片 className 加 `dark:bg-gray-100`

無業務邏輯異動。

## 回滾計劃

1. `git diff` 還原 `me/page.tsx` 即可。

## 預期測試結果

- [ ] dark mode 下 `/admin/me` 卡片背景為 `#1f1f1f`，比 body bg `#111` 略亮、有浮起感（待使用者目視驗證）
- [ ] light mode 下卡片仍為白底（無 regression）
- [ ] `npm run type:check` 通過

## 風險評估

- 僅影響 `/admin/me` 一頁，其他卡片（共用 `DetailCard` / `FormCard` 等元件）若同樣問題需另開 Spec 再處理；本 Spec 不擴大 scope。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## AI 協作紀錄

### 目標確認

使用者於 `/admin/me` 截圖回報 dark mode 卡片觀感不對，要求參考原本 hydrogen theme 修正。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 加 `dark:bg-gray-100` overlay | ✅ 採納 | 對齊 hydrogen template `modal-views/container.tsx` 等既有寫法，dark 端 `#1f1f1f` 比 body `#111` 略亮形成卡片浮起 |
| 改回 `bg-gray-0 dark:bg-gray-800` 舊寫法 | ❌ 棄用 | Spec E 已釐清 HIGH-number `dark:gray-{800,900}` 在反轉 palette 下 = 淺色 bug，是錯的 |
| 擴大 scope 修共用 `DetailCard` / `FormCard` 等元件 | ❌ 棄用 | 使用者只指 `/admin/me`，先窄範圍修，避免一次動太多 |
