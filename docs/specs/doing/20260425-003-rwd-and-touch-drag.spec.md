# Spec C: RWD + 觸控拖拉強化

> 建立日期: 2026-04-25
> 狀態: ✅ 已完成（程式碼層級；E2E 行動裝置驗證待使用者執行）
> 關聯計劃書: `docs/plans/doing/20260423-001-kanban-board.md`

---

## 目標

在 Spec B 的 Kanban 基礎上補強行動裝置體驗：

1. **TouchSensor 加入** — 既有 PointerSensor 預設能處理觸控，但長按啟動時間需要明確設定避免誤觸與滑動衝突
2. **Modal 行動版改全螢幕** — 編輯卡片 Modal 在 < 640px（手機）改成全螢幕版面，降低觸控誤點風險
3. **Sidebar 行動版抽屜化（既有實作驗證）** — Hydrogen layout 應已支援漢堡選單，本 Spec 主要為驗證 + 補檢查清單
4. **看板欄位行動版改 horizontal scroll** — < 768px（手機）4 欄改為水平捲動（snap），維持卡片閱讀性

## 背景

Spec B 已完成 Kanban 核心，但實作為桌機優先（`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`）。手機體驗有兩個風險：

- 拖拉觸控與頁面捲動衝突（PointerSensor 預設活化條件為 6px 移動距離，但觸控滑動經常超過 6px 卻不是要拖卡片）
- 編輯 Modal 在小螢幕上顯示為小盒子，用 input 時容易誤點外圍背景而關閉

> 參考知識：本專案 `docs/knowledge/` 目前為空。

---

## 受影響子專案

| 子專案 | 是否受影響 | 說明 |
| --- | --- | --- |
| `prisma` | ❌ | — |
| `common` | ❌ | — |
| `admin` | ✅（小幅） | 加 TouchSensor / 修 Modal RWD class / 看板欄位行動版橫滾 |

## 受影響檔案

### admin

| 檔案路徑 | 新增/修改 | 說明 |
| --- | --- | --- |
| `admin/src/app/admin/(dashboard)/kanban/page.tsx` | 修改 | `useSensors` 加 `TouchSensor`（delay: 200ms, tolerance: 5px）；columns 容器在手機加 `overflow-x-auto snap-x snap-mandatory` |
| `admin/src/app/admin/(dashboard)/kanban/_components/kanban-column.tsx` | 修改 | 加 `min-w-[280px] snap-start sm:min-w-0` 以支援手機水平捲動 |
| `admin/src/app/admin/(dashboard)/kanban/_components/edit-card-modal.tsx` | 修改 | 容器 class 改為 `sm:items-center items-end`；卡片 class `sm:max-w-lg sm:rounded-lg w-full max-w-full rounded-t-2xl rounded-b-none sm:rounded-b-lg max-h-[90vh] overflow-y-auto`，手機版貼底 + 全寬 |

---

## 邏輯變更點

### TouchSensor

```typescript
import { TouchSensor } from '@dnd-kit/core';

const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
);
```

- TouchSensor `delay: 200ms` 表示「按住 0.2 秒以上才啟動拖拉」，避免捲動衝突
- `tolerance: 5px` 表示按住時 5px 內的微小移動仍算「按住」

### 行動版水平捲動

桌機 lg+ 維持 `grid-cols-4`；< lg（含手機與平板）改為 `flex flex-row overflow-x-auto snap-x snap-mandatory gap-3`，每欄 `min-w-[280px] snap-start`。

### Modal 全螢幕

手機版（`< 640px` / `sm`）使用 bottom sheet 式呈現：
- 容器：`fixed inset-0 flex items-end sm:items-center justify-center bg-black/50`
- 內容卡片：`w-full max-w-full rounded-t-2xl sm:max-w-lg sm:rounded-lg max-h-[90vh] overflow-y-auto p-6`

---

## 預期測試結果

- [ ] 手機觸控拖拉：按住 0.2 秒可拖；快速滑動仍可正常捲動
- [ ] < 768px 看板欄位水平捲動，每欄占滿視窗約 90%
- [ ] 手機編輯卡片 → Modal 從底部滑入，全寬顯示
- [ ] 桌機與平板互動不變（Spec B 行為保留）
- [ ] `npm run build` 通過

## 風險評估

- TouchSensor 與 PointerSensor 並列時，dnd-kit 內部會自動依事件來源選用，不會衝突
- bottom sheet Modal 沒有滑動關閉手勢（需要額外 lib 實作），維持點擊外圍 / 點 Cancel 關閉

---

## 實際變更

<!-- PostToolUse Hook 自動追加 -->

## Bug Log

<!-- — -->

---

## AI 協作紀錄

### 目標確認

補強 Kanban 在行動裝置的體驗。

### 決策記錄

| 決策 | 結果 | 理由 |
| --- | --- | --- |
| TouchSensor delay 200ms | ✅ 採納 | dnd-kit 官方建議值；平衡拖拉啟動與滑動容忍 |
| 手機改 horizontal scroll 而非 stacked vertical | ✅ 採納 | 4 欄垂直堆疊會讓 viewport 看不到完整看板；橫滾配合 snap 體驗較佳 |
| Modal 用 bottom sheet 而非 fullscreen | ✅ 採納 | bottom sheet 保留視覺層級感（背景仍可見），且手機 thumb 操作友善 |

### 產出摘要

<!-- AI 完成後自動更新 -->
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/kanban/page.tsx` — Edit @ 2026-04-25 04:42
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/kanban/_components/kanban-column.tsx` — Edit @ 2026-04-25 04:43
- `e:/VisualStudioProject/IBuyPower.Apps/IBuypower.GIT/kanban/admin/src/app/admin/(dashboard)/kanban/_components/edit-card-modal.tsx` — Edit @ 2026-04-25 04:43
