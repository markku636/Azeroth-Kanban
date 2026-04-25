import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { auth } from '@/auth';
import { createAuditLog, getIpFromRequest } from '@/lib/audit-log-service';

/**
 * GET /api/v1/admin/roles - 角色列表（含權限數量）
 */
export const GET = withPermission(PERMISSIONS.ROLES_VIEW, async () => {
  const roles = await prisma.role.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      permissions: {
        include: { permission: { select: { code: true, name: true, groupCode: true } } },
      },
    },
  });

  const result = roles.map((role) => ({
    id: role.id,
    name: role.name,
    displayName: role.displayName,
    description: role.description,
    isSystem: role.isSystem,
    permissionCount: role.permissions.length,
    permissions: role.permissions.map((rp) => rp.permission.code),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  }));

  return ApiResponse.ok(result, '取得角色列表成功');
});

/**
 * POST /api/v1/admin/roles - 新增角色
 */
export const POST = withPermission(PERMISSIONS.ROLES_CREATE, async (request: NextRequest) => {
  const body = await request.json();
  const { name, displayName, description } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '角色名稱（英文代碼）為必填');
  }
  if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '顯示名稱為必填');
  }

  const existing = await prisma.role.findUnique({ where: { name: name.trim() } });
  if (existing) {
    return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '角色名稱已存在');
  }

  const session = await auth();

  const role = await prisma.role.create({
    data: {
      name: name.trim(),
      displayName: displayName.trim(),
      description: description?.trim() || null,
      isSystem: false,
    },
  });

  await createAuditLog({
    actorId: session?.user?.memberId,
    actorEmail: session?.user?.email ?? undefined,
    actorName: session?.user?.name ?? undefined,
    entityType: 'Role',
    entityId: role.id,
    action: 'create',
    newValue: { name: role.name, displayName: role.displayName, description: role.description },
    ipAddress: getIpFromRequest(request),
  });

  return ApiResponse.ok(role, '角色建立成功');
});
