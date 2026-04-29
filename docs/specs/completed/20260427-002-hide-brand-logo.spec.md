# 移除後台品牌 Logo

> 建立日期: 2026-04-27
> 狀態: ✅ 已完成
> 關聯計劃書: 無

---

## 目標

移除 admin 後台 layout 的品牌 Logo（mobile header 與 desktop sidebar 各一處）。

## 背景

使用者要求不要在後台介面顯示品牌 Logo。屬小幅 UI 調整。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | — |
| `common` | ❌ | — |
| `admin` | ✅ | 移除 hydrogen layout 中的 Logo `<Link>` 區塊 |

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/layouts/hydrogen/header.tsx` | 修改 | 移除 mobile/tablet 顯示的 Logo Link 與相關 import |
| `admin/src/layouts/hydrogen/sidebar.tsx` | 修改 | Logo 在手機（漢堡選單）縮小，桌機保持原大小 |

---

## 邏輯變更點

- `header.tsx`：移除 `<Link aria-label="Site Logo">…<Image src="/logo.png" /></Link>` 區塊；若 `Link` / `Image` import 未再使用則一併移除
- `sidebar.tsx`：**保留 Logo 不動**（使用者要求 sidebar 仍顯示）

## 預期測試結果

- [ ] mobile（iPhone SE）後台頁面不再顯示 Logo
- [ ] desktop sidebar 不再顯示 Logo，但選單與留白排版正常
- [ ] `npm run type:check` 通過
- [ ] `npm run lint` 通過

## 風險評估

- 無 DB / API 變更；僅前端視覺調整
- 需確認 `Link` / `Image` import 是否還被同檔其他地方使用，避免 lint unused-import 警告

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

使用者於 mobile 後台首頁截圖指出「這裡的 logo 不要顯示」。AI 推斷意圖為移除整個後台的品牌 Logo，包含 mobile header 與 desktop sidebar 兩處，以維持一致性。

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/layouts/hydrogen/header.tsx` — Edit @ 2026-04-27 11:28
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/layouts/hydrogen/sidebar.tsx` — Edit @ 2026-04-27 11:28
