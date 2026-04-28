import type { CardStatus, KanbanCard, Prisma } from '@prisma/client';
import { ApiErrorCode } from '@azeroth/common';
import { prisma } from '@/lib/prisma';
import { ApiResponse, ApiReturnCode, type ApiResult } from '@/lib/api-response';
import { createAuditLog } from '@/lib/audit-log-service';

const SORT_GAP = 1000;
const NORMALIZE_THRESHOLD = 2;

export type CardDto = Pick<
  KanbanCard,
  'id' | 'title' | 'description' | 'status' | 'sortOrder' | 'createdAt' | 'updatedAt'
>;

export type GroupedCards = Record<CardStatus, CardDto[]>;

/** API route 從 session 收集後傳給 service 寫 audit log 用 */
export interface KanbanActor {
  id: string;
  email: string | null;
  name: string | null;
  ipAddress?: string;
}

const ALL_STATUSES: CardStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

function auditFromCard(card: Pick<KanbanCard, 'title' | 'description' | 'status' | 'sortOrder'>) {
  return {
    title: card.title,
    description: card.description,
    status: card.status,
    sortOrder: card.sortOrder,
  };
}

function toDto(card: KanbanCard): CardDto {
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    status: card.status,
    sortOrder: card.sortOrder,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

function emptyBoard(): GroupedCards {
  return {
    TODO: [],
    IN_PROGRESS: [],
    IN_REVIEW: [],
    DONE: [],
  };
}

/** 列出某使用者的所有卡片，按 status 分組、欄內按 sortOrder 排序 */
export async function listOwnerBoard(ownerId: string): Promise<ApiResult<GroupedCards>> {
  try {
    const cards = await prisma.kanbanCard.findMany({
      where: { ownerId },
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }],
    });
    const grouped = emptyBoard();
    for (const c of cards) {
      grouped[c.status].push(toDto(c));
    }
    return ApiResponse.success(grouped, '取得看板成功');
  } catch (e) {
    console.error('[KanbanService.listOwnerBoard]', { ownerId }, e);
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      '載入看板失敗，請稍後再試',
      ApiErrorCode.SYSTEM.DB_ERROR
    );
  }
}

/** 取得欄末端 sortOrder（無卡片時回 0） */
async function maxSortOrderInColumn(
  ownerId: string,
  status: CardStatus,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  const result = await client.kanbanCard.aggregate({
    where: { ownerId, status },
    _max: { sortOrder: true },
  });
  return result._max.sortOrder ?? 0;
}

/** 建立卡片（落「待處理」末端） */
export async function createCard(
  ownerId: string,
  input: { title: string; description?: string },
  actor?: KanbanActor
): Promise<ApiResult<CardDto>> {
  if (!input.title?.trim()) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '請輸入卡片標題',
      ApiErrorCode.KANBAN.TITLE_REQUIRED
    );
  }
  const title = input.title.trim();
  if (title.length > 120) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '標題長度不可超過 120 字',
      ApiErrorCode.KANBAN.TITLE_TOO_LONG
    );
  }
  const description = input.description?.trim() || null;
  if (description && description.length > 2000) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '描述長度不可超過 2000 字',
      ApiErrorCode.KANBAN.DESCRIPTION_TOO_LONG
    );
  }

  try {
    const maxOrder = await maxSortOrderInColumn(ownerId, 'TODO');
    const card = await prisma.kanbanCard.create({
      data: {
        title,
        description,
        status: 'TODO',
        sortOrder: maxOrder + SORT_GAP,
        ownerId,
      },
    });
    await createAuditLog({
      actorId: actor?.id,
      actorEmail: actor?.email ?? undefined,
      actorName: actor?.name ?? undefined,
      entityType: 'KanbanCard',
      entityId: card.id,
      action: 'create',
      newValue: auditFromCard(card),
      ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(toDto(card), '卡片已建立');
  } catch (e) {
    console.error('[KanbanService.createCard]', { ownerId }, e);
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      '建立卡片失敗，請稍後再試',
      ApiErrorCode.SYSTEM.DB_ERROR
    );
  }
}

/** 取得單張卡片（強制 ownerId 過濾） */
export async function getCard(ownerId: string, id: string): Promise<ApiResult<CardDto>> {
  try {
    const card = await prisma.kanbanCard.findFirst({ where: { id, ownerId } });
    if (!card) {
      return ApiResponse.error(
        ApiReturnCode.NOT_FOUND,
        '找不到此卡片',
        ApiErrorCode.KANBAN.CARD_NOT_FOUND
      );
    }
    return ApiResponse.success(toDto(card), '取得卡片成功');
  } catch (e) {
    console.error('[KanbanService.getCard]', { ownerId, id }, e);
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      '讀取卡片失敗',
      ApiErrorCode.SYSTEM.DB_ERROR
    );
  }
}

/** 更新卡片基本欄位（不含位置移動，那走 moveCard） */
export async function updateCard(
  ownerId: string,
  id: string,
  patch: { title?: string; description?: string | null; status?: CardStatus },
  actor?: KanbanActor
): Promise<ApiResult<CardDto>> {
  if (patch.title !== undefined) {
    if (!patch.title.trim()) {
      return ApiResponse.error(
        ApiReturnCode.VALIDATION_ERROR,
        '請輸入卡片標題',
        ApiErrorCode.KANBAN.TITLE_REQUIRED
      );
    }
    if (patch.title.trim().length > 120) {
      return ApiResponse.error(
        ApiReturnCode.VALIDATION_ERROR,
        '標題長度不可超過 120 字',
        ApiErrorCode.KANBAN.TITLE_TOO_LONG
      );
    }
  }
  if (patch.description && patch.description.length > 2000) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '描述長度不可超過 2000 字',
      ApiErrorCode.KANBAN.DESCRIPTION_TOO_LONG
    );
  }
  if (patch.status && !ALL_STATUSES.includes(patch.status)) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '狀態無效',
      ApiErrorCode.KANBAN.INVALID_STATUS
    );
  }

  try {
    const existing = await prisma.kanbanCard.findFirst({
      where: { id, ownerId },
    });
    if (!existing) {
      return ApiResponse.error(
        ApiReturnCode.NOT_FOUND,
        '找不到此卡片',
        ApiErrorCode.KANBAN.CARD_NOT_FOUND
      );
    }

    const data: Prisma.KanbanCardUpdateInput = {};
    if (patch.title !== undefined) {data.title = patch.title.trim();}
    if (patch.description !== undefined) {
      data.description = patch.description ? patch.description.trim() : null;
    }
    // 改 status 時也要重算 sortOrder（落新欄末端）
    if (patch.status !== undefined && patch.status !== existing.status) {
      data.status = patch.status;
      const maxOrder = await maxSortOrderInColumn(ownerId, patch.status);
      data.sortOrder = maxOrder + SORT_GAP;
    }

    const card = await prisma.kanbanCard.update({
      where: { id },
      data,
    });
    await createAuditLog({
      actorId: actor?.id,
      actorEmail: actor?.email ?? undefined,
      actorName: actor?.name ?? undefined,
      entityType: 'KanbanCard',
      entityId: card.id,
      action: 'update',
      oldValue: auditFromCard(existing),
      newValue: auditFromCard(card),
      ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success(toDto(card), '卡片已更新');
  } catch (e) {
    console.error('[KanbanService.updateCard]', { ownerId, id }, e);
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      '更新卡片失敗',
      ApiErrorCode.SYSTEM.DB_ERROR
    );
  }
}

/** 刪除卡片 */
export async function deleteCard(
  ownerId: string,
  id: string,
  actor?: KanbanActor
): Promise<ApiResult<{ id: string }>> {
  try {
    const existing = await prisma.kanbanCard.findFirst({ where: { id, ownerId } });
    if (!existing) {
      return ApiResponse.error(
        ApiReturnCode.NOT_FOUND,
        '找不到此卡片',
        ApiErrorCode.KANBAN.CARD_NOT_FOUND
      );
    }
    await prisma.kanbanCard.delete({ where: { id } });
    await createAuditLog({
      actorId: actor?.id,
      actorEmail: actor?.email ?? undefined,
      actorName: actor?.name ?? undefined,
      entityType: 'KanbanCard',
      entityId: id,
      action: 'delete',
      oldValue: auditFromCard(existing),
      ipAddress: actor?.ipAddress,
    });
    return ApiResponse.success({ id }, '卡片已刪除');
  } catch (e) {
    console.error('[KanbanService.deleteCard]', { ownerId, id }, e);
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      '刪除卡片失敗',
      ApiErrorCode.SYSTEM.DB_ERROR
    );
  }
}

/**
 * 移動卡片：改 status + sortOrder
 * 演算法：
 *   - beforeId 與 afterId 都未提供：落該欄末端
 *   - 只有 afterId（要插在 afterId 之前 / 即 afterId 排序值之上）：sortOrder = afterId.sortOrder - GAP
 *   - 只有 beforeId（要插在 beforeId 之後）：sortOrder = beforeId.sortOrder + GAP
 *   - 兩者皆有（要插在中間）：sortOrder = (before + after) / 2
 *   - 計算結果與相鄰差距 < NORMALIZE_THRESHOLD → 觸發 normalize
 */
export async function moveCard(
  ownerId: string,
  id: string,
  input: { status: CardStatus; beforeId?: string | null; afterId?: string | null },
  actor?: KanbanActor
): Promise<ApiResult<{ id: string; status: CardStatus; sortOrder: number }>> {
  if (!ALL_STATUSES.includes(input.status)) {
    return ApiResponse.error(
      ApiReturnCode.VALIDATION_ERROR,
      '狀態無效',
      ApiErrorCode.KANBAN.INVALID_STATUS
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.kanbanCard.findFirst({
        where: { id, ownerId },
        select: { id: true, title: true, status: true, sortOrder: true },
      });
      if (!before) {return null;}

      const newSortOrder = await computeSortOrder(tx, ownerId, input);

      const updated = await tx.kanbanCard.update({
        where: { id },
        data: { status: input.status, sortOrder: newSortOrder },
        select: { id: true, title: true, status: true, sortOrder: true },
      });

      // 觸發 normalize：撈出該欄全部卡片，重排
      let afterMove = updated;
      if (await needsNormalize(tx, ownerId, input.status)) {
        await normalizeColumn(tx, ownerId, input.status);
        const normalized = await tx.kanbanCard.findUnique({
          where: { id },
          select: { id: true, title: true, status: true, sortOrder: true },
        });
        if (normalized) {afterMove = normalized;}
      }
      return { before, after: afterMove };
    });

    if (!result) {
      return ApiResponse.error(
        ApiReturnCode.NOT_FOUND,
        '找不到此卡片',
        ApiErrorCode.KANBAN.CARD_NOT_FOUND
      );
    }

    await createAuditLog({
      actorId: actor?.id,
      actorEmail: actor?.email ?? undefined,
      actorName: actor?.name ?? undefined,
      entityType: 'KanbanCard',
      entityId: id,
      action: 'move',
      oldValue: { title: result.before.title, status: result.before.status, sortOrder: result.before.sortOrder },
      newValue: { title: result.after.title, status: result.after.status, sortOrder: result.after.sortOrder },
      ipAddress: actor?.ipAddress,
    });

    return ApiResponse.success(
      { id: result.after.id, status: result.after.status, sortOrder: result.after.sortOrder },
      '卡片已移動'
    );
  } catch (e) {
    console.error('[KanbanService.moveCard]', { ownerId, id, input }, e);
    return ApiResponse.error(
      ApiReturnCode.INTERNAL_ERROR,
      '移動卡片失敗',
      ApiErrorCode.SYSTEM.DB_ERROR
    );
  }
}

async function computeSortOrder(
  tx: Prisma.TransactionClient,
  ownerId: string,
  input: { status: CardStatus; beforeId?: string | null; afterId?: string | null }
): Promise<number> {
  // afterId / beforeId 解析（限同 owner、同 status 才有效）
  const refIds = [input.beforeId, input.afterId].filter((v): v is string => !!v);
  const refs = refIds.length
    ? await tx.kanbanCard.findMany({
        where: { id: { in: refIds }, ownerId, status: input.status },
        select: { id: true, sortOrder: true },
      })
    : [];
  const before = input.beforeId ? refs.find((r) => r.id === input.beforeId) : undefined;
  const after = input.afterId ? refs.find((r) => r.id === input.afterId) : undefined;

  if (!before && !after) {
    const maxOrder = await maxSortOrderInColumn(ownerId, input.status, tx);
    return maxOrder + SORT_GAP;
  }
  if (before && !after) {
    return before.sortOrder + SORT_GAP;
  }
  if (!before && after) {
    return after.sortOrder - SORT_GAP;
  }
  // both
  return Math.floor((before!.sortOrder + after!.sortOrder) / 2);
}

async function needsNormalize(
  tx: Prisma.TransactionClient,
  ownerId: string,
  status: CardStatus
): Promise<boolean> {
  const cards = await tx.kanbanCard.findMany({
    where: { ownerId, status },
    orderBy: { sortOrder: 'asc' },
    select: { sortOrder: true },
  });
  for (let i = 1; i < cards.length; i++) {
    if (cards[i].sortOrder - cards[i - 1].sortOrder < NORMALIZE_THRESHOLD) {return true;}
  }
  return cards.some((c) => c.sortOrder < 1);
}

async function normalizeColumn(
  tx: Prisma.TransactionClient,
  ownerId: string,
  status: CardStatus
): Promise<void> {
  const cards = await tx.kanbanCard.findMany({
    where: { ownerId, status },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });
  for (let i = 0; i < cards.length; i++) {
    await tx.kanbanCard.update({
      where: { id: cards[i].id },
      data: { sortOrder: (i + 1) * SORT_GAP },
    });
  }
}
