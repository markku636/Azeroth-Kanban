import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiResponse } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';

/**
 * GET /api/v1/admin/login-records — 登入記錄列表（分頁）
 *
 * Query params:
 *   page       分頁頁碼（預設 1）
 *   pageSize   每頁筆數（預設 20，上限 100）
 *   email      Email 模糊搜尋
 *   status     success | failed
 *   startDate  ISO date 篩選起始
 *   endDate    ISO date 篩選結束
 */
export const GET = withPermission(
  PERMISSIONS.LOGIN_RECORDS_VIEW,
  async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)));
    const email = searchParams.get('email')?.trim() || undefined;
    const status = searchParams.get('status') || undefined;
    const startDateRaw = searchParams.get('startDate');
    const endDateRaw = searchParams.get('endDate');

    const where: Prisma.LoginRecordWhereInput = {};
    if (email) where.email = { contains: email, mode: 'insensitive' };
    if (status) where.status = status;
    if (startDateRaw || endDateRaw) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (startDateRaw) createdAt.gte = new Date(startDateRaw);
      if (endDateRaw) {
        // 結束日期包含當天：設為隔日 00:00
        const end = new Date(endDateRaw);
        end.setDate(end.getDate() + 1);
        createdAt.lte = end;
      }
      where.createdAt = createdAt;
    }

    const [totalItems, records] = await Promise.all([
      prisma.loginRecord.count({ where }),
      prisma.loginRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          provider: true,
          status: true,
          failureReason: true,
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
