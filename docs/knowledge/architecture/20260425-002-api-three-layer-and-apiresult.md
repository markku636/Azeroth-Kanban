---
name: API 三層架構 + ApiResult 統一回傳 + 雙軌錯誤碼
description: API Route → Service → Prisma 三層職責；service 不 throw，回傳 ApiResult；雙軌錯誤碼 ApiReturnCode (HTTP-like 數字) + ApiErrorCode (i18n key)
type: architecture
---

# API 三層架構 + ApiResult 統一回傳 + 雙軌錯誤碼

> 建立日期: 2026-04-25
> 分類: architecture
> 來源 Spec: 多個（`20260425-002-kanban-core`、`20260425-004-i18n-error-code-translation` 等）
> 來源 Bug: 無

---

## 背景

本專案 admin 後端在 Next.js 15 App Router 上實作所有 API。為了讓「錯誤路徑」和「成功路徑」都有一致型別、前端能直接根據 errorCode 翻譯訊息、並且把 Next.js Route handler 的責任壓到最薄，定下了三條互鎖的規則：(1) 三層分工（API Route / Service / Prisma），(2) Service 一律回傳 `ApiResult<T>` 不 throw，(3) 雙軌錯誤碼分工（HTTP 語意 vs i18n key）。

## 知識內容

### 三層架構與職責

```
┌────────────────────────────────────────────────────────┐
│  app/api/v1/**/route.ts   (Next.js Route Handler)      │
│  責任：                                                │
│   1. session 驗證（auth() 取出 memberId）              │
│   2. withPermission(...) 權限守衛                      │
│   3. parse request body / params（淺 validate）        │
│   4. 組 KanbanActor（actorId/email/name/ip）給 service │
│   5. 把 service 回傳的 ApiResult 包成 NextResponse     │
│  禁止：呼叫 prisma、寫業務分支邏輯                     │
└────────────────────────┬───────────────────────────────┘
                         │ ApiResult<T>
                         ▼
┌────────────────────────────────────────────────────────┐
│  src/lib/{kanban,permission,audit-log}-service.ts      │
│  責任：                                                │
│   1. 業務驗證（title 長度、status 合法性…）            │
│   2. Prisma 操作（含 $transaction）                    │
│   3. createAuditLog（如有 mutation）                   │
│   4. 回傳 ApiResult<T>，永不 throw                     │
│  禁止：碰 NextRequest / NextResponse / cookies         │
└────────────────────────┬───────────────────────────────┘
                         │ Prisma Client API
                         ▼
                @prisma/client → PostgreSQL
```

實證：
- API route：[`admin/src/app/api/v1/kanban/cards/route.ts`](../../../admin/src/app/api/v1/kanban/cards/route.ts) — 完全不碰 prisma
- Service：[`admin/src/lib/kanban-service.ts`](../../../admin/src/lib/kanban-service.ts) — 完全不碰 NextRequest

### Service 不 throw，一律回傳 ApiResult

```ts
// ❌ 不要：throw 讓呼叫方寫 try/catch
async function getCard(id: string) {
  const card = await prisma.kanbanCard.findUnique({ where: { id } });
  if (!card) throw new NotFoundError(...);
  return card;
}

// ✅ 採用：成功與失敗共用同一個型別
async function getCard(ownerId: string, id: string): Promise<ApiResult<CardDto>> {
  try {
    const card = await prisma.kanbanCard.findFirst({ where: { id, ownerId } });
    if (!card) {
      return ApiResponse.error(
        ApiReturnCode.NOT_FOUND,
        '找不到此卡片',
        ApiErrorCode.KANBAN.CARD_NOT_FOUND,
      );
    }
    return ApiResponse.success(toDto(card), '取得卡片成功');
  } catch (e) {
    console.error('[KanbanService.getCard]', { ownerId, id }, e);
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      '讀取卡片失敗',
      ApiErrorCode.SYSTEM.DB_ERROR,
    );
  }
}
```

理由：
- 呼叫方（API route）不需要 try/catch，型別系統強制處理 `success: false`
- 錯誤訊息分類在 service 內就決定（`NOT_FOUND` vs `VALIDATION_ERROR` vs `INTERNAL_ERROR`），route 只負責轉成 HTTP status

### `ApiResponse.json` 自動把 code 對應到 HTTP status

[`admin/src/lib/api-response.ts`](../../../admin/src/lib/api-response.ts) 把 base class 擴成 NextResponse 友善版：

```ts
static json<T>(result: ApiResult<T>): NextResponse<ApiResult<T>> {
  const httpStatus = result.code === ApiReturnCode.SUCCESS ? 200 : result.code;
  return NextResponse.json(result, { status: httpStatus });
}
```

**`ApiReturnCode` 的整數值刻意對齊 HTTP 語意**（400 / 401 / 403 / 404 / 429 / 500），所以 `result.code` 可以直接當 HTTP status 用，零映射。`SUCCESS = 0` 是唯一例外，需手動翻成 200。

### 雙軌錯誤碼：`ApiReturnCode`（數字）vs `ApiErrorCode`（字串）

為了同時支援「給 HTTP 用的粗分類」和「給 i18n 用的細分類」，[`common/src`](../../../common/src/) 同時暴露兩套常數：

| 用途 | 名稱 | 形式 | 範例 |
| --- | --- | --- | --- |
| HTTP 狀態 / 粗分類 | `ApiReturnCode` | `enum` 數字 | `NOT_FOUND = 404` |
| i18n key / 細分類 | `ApiErrorCode` | dot-notation 字串 | `kanban.card_not_found` |

`ApiResult` 同時帶兩者：

```ts
interface ApiResult<T> {
  success: boolean;
  code: ApiReturnCode;          // 粗分類，前端決定 status / 大方向
  message: string;              // 給後端 log / fallback 文案
  errorCode?: string;           // 細分類，前端 t(`errors.${errorCode}`)
  errorParams?: Record<string, unknown>;  // i18n {{var}} 替換
  data?: T;
  timestamp: number;
}
```

#### 為什麼分兩軌而不只用一套？

- **只用數字 (404)**：細到「卡片不存在」vs「角色不存在」就無法分辨 → 前端只能寫死 message
- **只用字串 (`kanban.card_not_found`)**：HTTP status 仍要決定，前端拿到字串還得映射 → 沒省事
- **雙軌**：粗分類給 HTTP / 邏輯分支用、細分類給文案用，兩個維度獨立演化（新增業務錯誤不需動 HTTP code）

#### 前端如何消費

[`admin/src/lib/translate-api-error.ts`](../../../admin/src/lib/translate-api-error.ts) 提供 `tApiError(res, t, fallbackKey)`，邏輯是：

1. 若 `res.errorCode` 存在 → `t('errors.' + errorCode, errorParams)`
2. 否則 fallback 到呼叫端傳入的 i18n key

i18n 字典放在 `admin/src/locales/{zh-TW,en}/errors.json`，key 結構與 `ApiErrorCode` 巢狀完全一致。

### Audit log 與 service 同層、由 service 主動呼叫

`createAuditLog` 不放在 middleware 也不放在 API route，而是**由 service 在 mutation 成功後立即呼叫**：

```ts
const card = await prisma.kanbanCard.update({ ... });
await createAuditLog({
  actorId: actor?.id,
  entityType: 'KanbanCard',
  entityId: card.id,
  action: 'update',
  oldValue: auditFromCard(existing),
  newValue: auditFromCard(card),
});
return ApiResponse.success(toDto(card), '卡片已更新');
```

理由：
- **Action 名稱與業務語意綁定**：`move` 是 kanban 特有 action，audit middleware 無從推斷
- **oldValue / newValue diff 需要 service 內部資料**：route 拿到的只是 patch，沒有 before snapshot
- **失敗的 mutation 不該記錄**：service 在「成功 update」之後才呼叫，自然 skip 失敗情境

API route 的責任縮減為提供 `KanbanActor`（id / email / name / ip）：

```ts
function buildActor(session: Session, request: NextRequest): KanbanActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}
```

### Owner-scoped 查詢的硬性規範

**所有 kanban service method 第一個參數必為 `ownerId`**，且查詢條件強制帶 `where: { ownerId, ... }`。即使 API 層的 session 已驗證，service 內仍要帶上 owner filter，作為第二道防線：

```ts
// ✅ 即使 id 已知唯一，仍要 ownerId 過濾
await prisma.kanbanCard.findFirst({ where: { id, ownerId } });

// ❌ 危險：透過 id 直接拿，跨帳號污染
await prisma.kanbanCard.findUnique({ where: { id } });
```

對應 schema 上的 composite index：`@@index([ownerId, status, sortOrder], name: "idx_owner_status_order")`，讓「列出某 owner 在某 status 的排序」走 index seek。

## 適用場景

- 新增 API endpoint：先想清楚 service signature（含 ownerId / actor）再寫 route handler
- 新增業務錯誤碼：在 `common/src/api-error-code.ts` 加 leaf → 同步 i18n 字典 → service 帶上 `errorCode`
- 新增 audit-log 對象：`audit-log-service.ts` 的 `AuditEntityType` union 加新成員、service 內呼叫 `createAuditLog`
- 規劃跨 service 的 transaction：放在某個 service 內用 `prisma.$transaction`，仍回 `ApiResult`，不要把 transaction 拉到 route 層

## 注意事項

- **API route 嚴禁直呼 prisma**：一旦發現 route 內有 `prisma.x.create(...)`，立刻往 service 搬。否則 audit log、權限二次檢查、ownerId 過濾都會散落各處。
- **Service 內仍要 try/catch DB error**：Prisma 例外（連線錯誤、唯一鍵衝突）必須包成 `ApiResult` 回傳，不能讓 promise reject 飄到 route。
- **`ApiResponse.json(result)` 對 `SUCCESS=0` 要特例**：base class 已處理（0 → 200），但若新增 ApiReturnCode 條目要保證值 >= 100 否則 NextResponse 會丟 status 範圍錯誤。
- **errorCode 是選填**：相容舊 API（沒帶 errorCode）。新功能一律帶上，前端才能精準翻譯；fallback message 仍是必要保險。
- **不要把 `actor` 設為必填**：未登入或 cron job 觸發的 service call 仍可能成立（雖然目前所有 mutation 都過 withPermission）。`actor?: KanbanActor` 維持 optional 比較有彈性。
- **錯誤訊息必含上下文**：`console.error('[KanbanService.moveCard]', { ownerId, id, input }, e)` — class.method + 關鍵參數，方便 grep。模糊訊息（`'Error'`, `'failed'`）禁止。

---

<!-- 此文件為永久知識庫，AI 可在後續開發中追加更新 -->
<!-- 更新記錄：
  - 2026-04-25: 初次建立，從目前系統架構提煉
-->
