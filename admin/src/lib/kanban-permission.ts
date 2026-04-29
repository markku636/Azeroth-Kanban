import type { NextResponse } from 'next/server';
import { ApiErrorCode } from '@azeroth/common';
import { prisma } from '@/lib/prisma';
import { ApiResponse, ApiReturnCode, type ApiResult } from '@/lib/api-response';
import { hasPermission } from '@/lib/permission-service';

export type CardOwnerCheckResult =
  | { ok: true; ownerId: string; bypassOwnership: boolean }
  | { ok: false; response: NextResponse<ApiResult> };

/**
 * 檢查當前 actor 是否能操作指定卡片：
 * - 卡片存在且 owner === actor → 放行（bypassOwnership=false）
 * - 卡片存在但 owner ≠ actor → 檢查 fallbackPermission；通過則放行（bypassOwnership=true）
 * - 卡片存在但 owner ≠ actor 且無 fallback 權限 → 403 FORBIDDEN
 * - 卡片不存在 → 404 NOT_FOUND（不洩漏 actor 是否真的可以管理該卡）
 *
 * 回傳 ownerId 為卡片實際 owner，service layer 用此值做 sortOrder / column 計算。
 */
export async function ensureOwnerOrAllPermission(
  actorMemberId: string,
  actorRoles: string[],
  cardId: string,
  fallbackPermission: string,
): Promise<CardOwnerCheckResult> {
  const card = await prisma.kanbanCard.findUnique({
    where: { id: cardId },
    select: { ownerId: true },
  });
  if (!card) {
    return {
      ok: false,
      response: ApiResponse.fail(
        ApiReturnCode.NOT_FOUND,
        '找不到此卡片',
        ApiErrorCode.KANBAN.CARD_NOT_FOUND,
      ),
    };
  }

  if (card.ownerId === actorMemberId) {
    return { ok: true, ownerId: actorMemberId, bypassOwnership: false };
  }

  const canAll = await hasPermission(actorRoles, fallbackPermission);
  if (canAll) {
    return { ok: true, ownerId: card.ownerId, bypassOwnership: true };
  }

  return {
    ok: false,
    response: ApiResponse.fail(
      ApiReturnCode.FORBIDDEN,
      '無權操作此卡片',
      ApiErrorCode.KANBAN.FORBIDDEN_NOT_OWNER,
    ),
  };
}
