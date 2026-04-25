import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { clearPermissionCache } from '@/lib/permission-service';
import { createAuditLog, getIpFromRequest } from '@/lib/audit-log-service';

/**
 * PUT /api/v1/admin/roles/:id/permissions - 更新角色的權限配置
 * Body: { permissionCodes: string[] }
 */
export const PUT = withPermission(PERMISSIONS.ROLES_EDIT, async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) => {
  const { id } = await params;
  const body = await request.json();
  const { permissionCodes } = body;

  if (!Array.isArray(permissionCodes)) {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, 'permissionCodes 必須為陣列');
  }

  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      permissions: {
        include: { permission: { select: { code: true } } },
      },
    },
  });
  if (!role) {
    return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '角色不存在');
  }

  const oldCodes = role.permissions.map((rp) => rp.permission.code).sort();

  const permissions = await prisma.permission.findMany({
    where: { code: { in: permissionCodes } },
  });

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    ...permissions.map((perm) =>
      prisma.rolePermission.create({
        data: { roleId: id, permissionId: perm.id },
      })
    ),
  ]);

  clearPermissionCache();

  const newCodes = permissions.map((p) => p.code).sort();
  const session = await auth();
  await createAuditLog({
    actorId: session?.user?.memberId,
    actorEmail: session?.user?.email ?? undefined,
    actorName: session?.user?.name ?? undefined,
    entityType: 'RolePermission',
    entityId: id,
    action: 'update',
    oldValue: { roleName: role.name, permissionCodes: oldCodes },
    newValue: { roleName: role.name, permissionCodes: newCodes },
    ipAddress: getIpFromRequest(request),
  });

  return ApiResponse.ok(
    { roleId: id, permissionCount: permissions.length },
    '角色權限更新成功'
  );
});
