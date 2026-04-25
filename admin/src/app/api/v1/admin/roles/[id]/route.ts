import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { auth } from '@/auth';
import { createAuditLog, getIpFromRequest } from '@/lib/audit-log-service';

/**
 * PUT /api/v1/admin/roles/:id - 編輯角色
 */
export const PUT = withPermission(PERMISSIONS.ROLES_EDIT, async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) => {
  const { id } = await params;
  const body = await request.json();
  const { displayName, description } = body;

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) {
    return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '角色不存在');
  }

  const session = await auth();

  const updated = await prisma.role.update({
    where: { id },
    data: {
      ...(displayName !== undefined && { displayName: displayName.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
    },
  });

  await createAuditLog({
    actorId: session?.user?.memberId,
    actorEmail: session?.user?.email ?? undefined,
    actorName: session?.user?.name ?? undefined,
    entityType: 'Role',
    entityId: id,
    action: 'update',
    oldValue: { displayName: role.displayName, description: role.description },
    newValue: { displayName: updated.displayName, description: updated.description },
    ipAddress: getIpFromRequest(request),
  });

  return ApiResponse.ok(updated, '角色更新成功');
});

/**
 * DELETE /api/v1/admin/roles/:id - 刪除角色
 */
export const DELETE = withPermission(PERMISSIONS.ROLES_DELETE, async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) => {
  const { id } = await params;

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) {
    return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '角色不存在');
  }

  if (role.isSystem) {
    return ApiResponse.fail(ApiReturnCode.FORBIDDEN, '系統角色不可刪除');
  }

  const session = await auth();

  await createAuditLog({
    actorId: session?.user?.memberId,
    actorEmail: session?.user?.email ?? undefined,
    actorName: session?.user?.name ?? undefined,
    entityType: 'Role',
    entityId: id,
    action: 'delete',
    oldValue: { name: role.name, displayName: role.displayName, description: role.description },
    ipAddress: getIpFromRequest(request),
  });

  await prisma.role.delete({ where: { id } });

  return ApiResponse.ok(null, '角色已刪除');
});
