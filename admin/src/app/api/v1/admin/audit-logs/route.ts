import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiResponse } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';

/**
 * GET /api/v1/admin/audit-logs — 後台操作記錄列表（分頁）
 *
 * Query params:
 *   page        分頁頁碼（預設 1）
 *   pageSize    每頁筆數（預設 20，上限 100）
 *   entityType  實體類型篩選（Role / Member / Platform ...）
 *   action      操作類型篩選（create / update / delete）
 *   actorEmail  操作者 email 模糊搜尋
 *   startDate   ISO date 篩選起始
 *   endDate     ISO date 篩選結束
 */
export const GET = withPermission(
  PERMISSIONS.AUDIT_LOGS_VIEW,
  async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)));
    const entityType = searchParams.get('entityType')?.trim() || undefined;
    const action = searchParams.get('action')?.trim() || undefined;
    const actorEmail = searchParams.get('actorEmail')?.trim() || undefined;
    const startDateRaw = searchParams.get('startDate');
    const endDateRaw = searchParams.get('endDate');

    const where: Prisma.AuditLogWhereInput = {};
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;
    if (actorEmail) where.actorEmail = { contains: actorEmail, mode: 'insensitive' };
    if (startDateRaw || endDateRaw) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (startDateRaw) createdAt.gte = new Date(startDateRaw);
      if (endDateRaw) {
        const end = new Date(endDateRaw);
        end.setDate(end.getDate() + 1);
        createdAt.lte = end;
      }
      where.createdAt = createdAt;
    }

    const [totalItems, records] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          actorEmail: true,
          actorName: true,
          entityType: true,
          entityId: true,
          action: true,
          oldValue: true,
          newValue: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / pageSize);

    return ApiResponse.ok({
      items: records,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  }
);
