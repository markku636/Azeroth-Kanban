import { prisma } from '@/lib/prisma';
import { ApiResponse } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';

/**
 * GET /api/v1/admin/users - 所有使用者（供 RBAC 指派角色用）
 */
export const GET = withPermission(PERMISSIONS.USER_ROLES_VIEW, async () => {
  const users = await prisma.member.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return ApiResponse.ok(users, '取得使用者列表成功');
});
