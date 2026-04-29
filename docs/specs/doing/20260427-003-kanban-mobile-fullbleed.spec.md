# Kanban 頁手機版全寬化 + 橫向滑動欄位填滿視窗寬度

> 建立日期: 2026-04-27
> 狀態: 🔵 開發中
> 關聯計劃書: 無（中型 UI 調整，已於 Claude plan mode 取得使用者確認）

---

## 目標

iPhone SE（375px）瀏覽 `/kanban` 時：

1. Kanban 頁面**佔滿整個視窗寬度**，移除手機累積的 32px 左右白邊。
2. 橫向滑動的每個欄位**整欄等於一個視窗寬**，配合 snap 達到「滑一下切到下一欄」的體驗。
3. 不影響其他 dashboard 頁（Roles / Users / Audit Logs 等仍維持現有 padding）。

## 背景

使用者在手機尺寸發現左右兩側留白過多、橫向滑動的欄位被壓縮。手機螢幕本就有限，這些 padding 屬於浪費。

目前白邊來源：
- `admin/src/layouts/hydrogen/layout.tsx:14` 的 `px-4`（16px）
- `admin/src/app/(dashboard)/kanban/page.tsx:107` 的 `p-4`（16px）

→ 累計 32px 邊。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | 無 schema 變更 |
| `common` | ❌ | 無共用型別變更 |
| `admin` | ✅ | Kanban 頁與欄位元件 className 調整 |

## 建議開發順序

1. `admin` — 調整 Kanban 頁外層 padding 與欄位寬度

---

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/(dashboard)/kanban/page.tsx` | 修改 | 外層 padding；軌道改全尺寸橫向 + 手機右側 `-mr-6` 出血到視窗邊 |
| `admin/src/app/(dashboard)/kanban/_components/kanban-column.tsx` | 修改 | 手機欄寬 `w-[85%]` 露出下一欄一截；sm/md `w-[320px]`，lg+ 維持 grid |
| `admin/src/app/(dashboard)/kanban/_components/inline-card-form.tsx` | 修改 | 重排結構：標題 → 說明 → 新增按鈕（按鈕移到說明欄下方） |

> 不動 `admin/src/layouts/hydrogen/layout.tsx`，避免影響其他 dashboard 頁。

---

## 邏輯變更點

### admin

#### `admin/src/app/(dashboard)/kanban/page.tsx`

- 最外層 `<div>` className：
  - 從 `flex h-full flex-col p-4 sm:p-6`
  - 改為 `flex h-full flex-col p-0 sm:p-6 -mx-4 md:mx-0`
- 標題區外層 `<div>` 加 `px-4 sm:px-0`，避免標題貼到視窗左右邊。
- Add Card 表單外層 `<div>` 加 `px-4 sm:px-0`。
- 欄位軌道 className：
  - 從 `flex flex-1 flex-col gap-3 pb-2 sm:flex-row sm:overflow-x-auto sm:snap-x sm:snap-mandatory lg:grid lg:grid-cols-4 lg:overflow-x-visible lg:snap-none`
  - 改為 `flex flex-1 flex-row gap-3 pb-2 overflow-x-auto snap-x snap-mandatory lg:grid lg:grid-cols-4 lg:overflow-x-visible lg:snap-none`

#### `admin/src/app/(dashboard)/kanban/_components/kanban-column.tsx`

- 欄位外層 className：
  - 從 `flex h-full min-h-[200px] w-full flex-shrink-0 snap-start flex-col rounded-lg border sm:min-w-[280px] sm:w-auto lg:min-w-0 lg:flex-shrink ${config.bg} ${config.border}`
  - 改為 `flex h-full min-h-[200px] w-screen flex-shrink-0 snap-start flex-col rounded-lg border sm:w-[320px] sm:min-w-[280px] lg:w-auto lg:min-w-0 lg:flex-shrink ${config.bg} ${config.border}`

## 回滾計劃

1. 還原兩個檔案至本次修改前的 git HEAD 版本。

## 預期測試結果

- [ ] iPhone SE（375）：欄位軌道左右完全貼邊，無白邊；橫向滑動有 snap 對齊；每欄寬 = 375px。
- [ ] iPad（768）：每欄 320px，可同時看到約 2 欄 + 一點下一欄。
- [ ] 桌面 1440：4 欄 grid 並排，與目前桌面行為一致。
- [ ] 手機尺寸下拖拉卡片仍正常（@dnd-kit TouchSensor）。
- [ ] 其他 dashboard 頁（`/roles`, `/audit-logs`）padding 未受影響。

## 風險評估

- `w-screen` 在父容器有 padding 時可能溢出。已透過 `-mx-4 md:mx-0` 抵消 HydrogenLayout 的 px-4，理論對齊整視窗；實作後需實機檢查。
- 如未來 sidebar 在手機展開覆蓋全寬，需確認 `w-screen` 不會與 sidebar 寬度衝突。

---

## 實際變更

<!-- PostToolUse Hook 自動追加 Edit/Write 的檔案路徑 -->

## Bug Log

{開發過程中遇到的 Bug}

---

## AI 協作紀錄（本次 Spec 範圍）

### 目標確認

手機（iPhone SE 375）下 Kanban 頁面內容偏窄，左右白邊浪費；橫向滑動的欄位也跟著被壓縮。改成全寬 + 每欄一畫面寬。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| 改 `HydrogenLayout` 共用 padding | ❌ 棄用 | 會影響其他 dashboard 頁的視覺，改動面太大 |
| 用 `-mx-4 md:mx-0` 在 Kanban 頁局部抵消父層 padding | ✅ 採納 | 改動只限於 Kanban，安全 |
| 手機 `w-full` vs `w-screen` | `w-screen` ✅ 採納 | flex 容器 + flex-shrink-0 下 `w-full` 會塌成 0；要明確一個視窗寬 |

### 產出摘要

<!-- 實作完成後補上 -->
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/kanban/page.tsx` — Edit @ 2026-04-27 11:33
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/kanban/_components/kanban-column.tsx` — Edit @ 2026-04-27 11:33
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/(dashboard)/kanban/_components/inline-card-form.tsx` — Edit @ 2026-04-27 11:40
