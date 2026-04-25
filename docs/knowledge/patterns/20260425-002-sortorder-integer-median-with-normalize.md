# sortOrder：整數 + 中位數插入 + 必要時批次 normalize

> 建立日期: 2026-04-25
> 分類: patterns
> 來源 Spec: `docs/specs/completed/20260425-002-kanban-core.spec.md`（Spec B § Service 層）
> 來源 Bug: 無

---

## 背景

Kanban 卡片可在欄內任意順序排列，並透過拖拉跨欄移動。需要一個欄位儲存「該卡片在所屬 status 內的順序」，且每次拖拉只能更新少量 row（不能整欄重排）。

## 知識內容

### 設計

`KanbanCard.sortOrder` 為 `INT`（不是浮點、不是字串）。所有插入 / 移動操作只負責算出**新卡片的 sortOrder 值**，不動其他卡片，除非觸發 normalize。

### 算法（4 條 case）

設要把卡片 X 插入「`prev` 卡片之後、`next` 卡片之前」：

| 情境 | `prev` | `next` | X.sortOrder |
| --- | --- | --- | --- |
| 插入欄末端（包含新增到「待處理」） | 該欄最大 | — | `prev.sortOrder + 1000` |
| 插入欄首位 | — | 該欄最小 | `next.sortOrder - 1000` |
| 插入兩卡之間 | 任意 | 任意 | `Math.floor((prev.sortOrder + next.sortOrder) / 2)` |
| 欄為空 | — | — | `1000` |

「間距 1000」這個 magic number 給「兩卡之間連續插入 ~10 次」的緩衝；超出後會觸發 normalize。

### Normalize（觸發條件 + 執行）

**觸發條件**：算出的中位數 `mid` 滿足 `mid <= prev.sortOrder` 或 `mid >= next.sortOrder`（即兩卡之間沒有合法的整數可放）。

**執行**：在同一個 transaction 內，把該欄所有卡片 `UPDATE` 為 `1000, 2000, 3000, …`，然後重新算插入點。

```sql
-- 偽碼：normalize 該欄
UPDATE kanban_card
SET sort_order = new_order
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) * 1000 AS new_order
  FROM kanban_card
  WHERE owner_id = $1 AND status = $2
) ranked
WHERE kanban_card.id = ranked.id;
```

執行後再以「插入欄末端 / 中位數」算法寫入新卡片。整個過程包在同一個 Prisma `$transaction` 中。

### 為什麼不用 LexoRank / 浮點

| 方案 | 取捨 |
| --- | --- |
| **整數 + normalize**（採用） | 無第三方依賴；DB index 友善；卡片數 < ~10⁴ 時 normalize 成本可接受 |
| LexoRank（字串 base-36 排序） | 適合卡片數 > 10⁵；但需第三方算法 lib，且字串比較成本高，過度工程 |
| 浮點數（`(prev + next) / 2`） | 每次拖拉精度遞減；最終 `JSON.stringify` 出現超長尾數，UX 差 |

本專案面試規模 < 100 卡片，整數方案最直接。

## 適用場景

- 任何「使用者可拖拉重排的列表」：Kanban 看板、Trello-like、todo list 排序、表單欄位排序、設定頁面項目排序…
- 列表規模在 10⁴ 以下、後端可承受偶爾的批次 normalize（一個欄一次 UPDATE，rows 約等於該欄卡片數）
- 需要 SQL `ORDER BY` 友善（整數 index），且不想引入新算法 lib

## 範例

API 設計上，**client 不傳 sortOrder**，只傳「插入位置」：

```ts
// POST /api/v1/kanban/cards/:id/move
// body: { status: CardStatus; beforeId?: string; afterId?: string }

// Server 端虛擬碼
async function moveCard(cardId: string, toStatus: CardStatus, beforeId?: string, afterId?: string) {
  const before = beforeId ? await prisma.kanbanCard.findUnique({ where: { id: beforeId } }) : null;
  const after  = afterId  ? await prisma.kanbanCard.findUnique({ where: { id: afterId  } }) : null;

  let next: number;
  if (!before && !after) next = 1000;                                         // 欄為空
  else if (!before)      next = after!.sortOrder - 1000;                      // 插首位
  else if (!after)       next = before.sortOrder + 1000;                      // 插末端
  else                   next = Math.floor((before.sortOrder + after.sortOrder) / 2);

  // Normalize trigger：中位數塌陷
  if ((before && next <= before.sortOrder) || (after && next >= after.sortOrder)) {
    await normalizeColumn(toStatus); // 重排為 1000, 2000, 3000…
    return moveCard(cardId, toStatus, beforeId, afterId); // 重算
  }
  return prisma.kanbanCard.update({ where: { id: cardId }, data: { status: toStatus, sortOrder: next } });
}
```

實作見 `admin/src/lib/kanban-service.ts`。

## 注意事項

- **必須包 transaction**：normalize + insert 兩階段，外部不能觀察到中間狀態，否則 race condition 下會看到「兩卡片同 sortOrder」。
- **DB index**：本案複合 index `(owner_id, status, sort_order)` 命名 `idx_owner_status_order`，剛好對應「主查詢 + sortOrder 排序」。其他用例請類比建好對應 index。
- **dnd-kit 的 over.id**：`handleDragEnd` 必須先 `if (over.id === active.id) return`，避免拖到自己時也呼叫 API。
- **不要把 sortOrder 開放給 client API 寫入**：所有寫入路徑（POST、PATCH、move）一律由 server 算；client 只送插入點。
- **跨欄移動**：把「目標 status」也放進同一個 update，避免兩次 round-trip。

---

<!-- 此文件為永久知識庫，AI 可在後續開發中追加更新 -->
<!-- 更新記錄：
  - 2026-04-25: 初次建立，來源 Spec B（20260425-002-kanban-core）
-->
