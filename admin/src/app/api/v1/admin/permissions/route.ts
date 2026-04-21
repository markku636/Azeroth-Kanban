import { prisma } from '@/lib/prisma';
import { ApiResponse } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';

/**
 * GET /api/v1/admin/permissions - 權限列表（按群組分組）
 */
export const GET = withPermission(PERMISSIONS.PERMISSIONS_VIEW, async () => {
  const permissions = await prisma.permission.findMany({
    orderBy: [{ groupCode: 'asc' }, { code: 'asc' }],
  });

  // 按群組分組
  const grouped = permissions.reduce((acc, perm) => {
    if (!acc[perm.groupCode]) {
      acc[perm.groupCode] = {
        groupCode: perm.groupCode,
        groupName: perm.groupName,
        permissions: [],
      };
    }
    acc[perm.groupCode].permissions.push({
      id: perm.id,
      code: perm.code,
      name: perm.name,
      description: perm.description,
    });
    return acc;
  }, {} as Record<string, { groupCode: string; groupName: string; permissions: { id: string; code: string; name: string; description: string | null }[] }>);

  return ApiResponse.ok(Object.values(grouped), '取得權限列表成功');
});
