# Spec: 登入頁 UX 改版（移除預設帳密提示卡 + 加入快速填入按鈕 + 修主登入鈕色票）

> 建立日期: 2026-04-25
> 狀態: ✅ 已完成
> 關聯計劃書: 無（Spec E + 007 後續視覺微調，使用者目視回報）

---

## 目標

1. 移除登入頁的「預設帳密」藍色提示卡（已被新加入的快速填入按鈕取代）
2. 在帳號 / 密碼欄位上方加入 3 顆「快速填入」按鈕（admin / user / viewer），點擊自動帶入對應帳密進欄位（不自動送出，使用者仍需按「登入」確認）
3. 修正主登入鈕在 dark mode 下「白底白字」看不到的問題（從 `bg-primary` 改 `bg-blue-600`）

## 背景

- Spec E 把登入鈕從 `bg-white dark:bg-gray-800` 之類改為 `bg-primary`，但 `--primary-default` 在 dark mode 反轉為 `#f1f1f1`（近白），導致 `text-white` 配 `bg-primary` 變「白底白字」看不到
- 使用者改要求：與其用文字提示「請參考 README」，不如直接給 3 顆快速填入按鈕，UX 更直覺
- 三組預設帳號（README.md「預設帳號」章節）：
  - `admin@example.com` / `Admin@1234` — 全部 14 個權限
  - `user@example.com` / `User@1234` — Kanban CRUD（自己的卡片）
  - `viewer@example.com` / `Viewer@1234` — Kanban 看板唯讀

> 參考知識：Spec E + 007 已建立的 auto-flip palette 慣例。本 Spec 對「主要動作鈕」採用 `bg-blue-600` 以對齊 kanban 既有慣例（add-card / save / confirm 都用此色）。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 |
| `common` | ❌ | 無 |
| `admin` | ✅ | 登入頁 + 兩個 i18n locale |

---

## 受影響檔案

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/admin/login/page.tsx` | 修改 | 移除提示卡 + 加 3 顆快速填入按鈕 + 主鈕色 |
| `admin/src/locales/zh-TW.json` | 修改 | 移除 `credentialsHintTitle/Body`、新增 `quickFillTitle` |
| `admin/src/locales/en.json` | 修改 | 同上 |

---

## 邏輯變更點

### `admin/src/app/admin/login/page.tsx`

1. 移除 `<div ...>` 含 `PiInfoBold` 的整個提示卡（原 63–73 行）
2. 在 `<form>` 內 username input 之前加一個 toolbar：

```tsx
<div className="mb-4">
  <p className="mb-2 text-xs text-gray-500">{t("login.quickFillTitle")}</p>
  <div className="grid grid-cols-3 gap-2">
    <button type="button" onClick={() => fillCredentials("admin@example.com", "Admin@1234")}
            className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300 dark:hover:bg-rose-900/50">
      Admin
    </button>
    {/* User: emerald, Viewer: amber 同形式 */}
  </div>
</div>
```

3. 加入 helper：

```ts
const fillCredentials = (u: string, p: string) => { setUsername(u); setPassword(p); setError(""); };
```

4. 主登入鈕：`bg-primary` → `bg-blue-600`、`hover:bg-primary/90` → `hover:bg-blue-700`、`focus:ring-primary` → `focus:ring-blue-500`

### i18n

- 刪除 `login.credentialsHintTitle`、`login.credentialsHintBody`
- 新增 `login.quickFillTitle`：「快速填入測試帳號」 / 「Quick fill test credentials」

## 安全性備註

- 預設帳號為 demo / 開發環境用，已寫在 README.md 公開；本 Spec 只是把資訊從 README 跳轉縮短為一鍵填入
- 點擊按鈕**只填入欄位、不自動送出**，避免誤觸或被 XSS 借力直接登入
- 生產環境部署前須移除這三組預設帳號（屬部署 SOP，非本 Spec 範圍）

## 預期測試結果

- [ ] dark mode 主登入鈕為藍底白字（`bg-blue-600`）
- [ ] 點擊三顆快速填入鈕後，username + password 欄位被填入對應預設帳密
- [ ] 點擊登入按鈕成功登入對應角色
- [ ] light mode 無 regression
- [ ] `npm run type:check` 通過

## 風險評估

- 純 UI / state 改動，無資料層或 API 變更
- i18n key 移除後若有其他元件引用會 type:check 失敗 → 已 grep 確認只在 login page 用

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## AI 協作紀錄

### 目標確認

使用者三段需求合併處理：
1. 主登入鈕看不到字（dark mode 白底白字）
2. 加 3 顆快速填入按鈕（README 三組帳號）
3. 移除冗餘的「預設帳密」提示卡

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 主鈕用 `bg-blue-600` | ✅ 採納 | 對齊 kanban add-card/save/confirm 慣例，dark mode 文字可見 |
| 快速填入「只填不送」 | ✅ 採納 | 使用者仍需手動按登入，避免誤觸 |
| 三色按鈕（rose/emerald/amber）視覺區分 admin/user/viewer | ✅ 採納 | 顏色語意對應權限大小：紅=管理員、綠=一般、琥珀=唯讀 |
| 直接送出登入 | ❌ 棄用 | 對 UX 太突兀，且 demo 時通常想看一下欄位內容才送 |
| 保留提示卡 + 加按鈕並陳 | ❌ 棄用 | 資訊冗餘，文字提示已被按鈕取代 |
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/login/page.tsx` — Edit @ 2026-04-25 16:14
