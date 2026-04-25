import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { auth } from '@/auth';
import { createAuditLog, getIpFromRequest } from '@/lib/audit-log-service';
import { clearPermissionCache } from '@/lib/permission-service';

/**
 * PUT /api/v1/admin/users/:id/role - 指派使用者角色
 * Body: { roleName: string | null }
 */
export const PUT = withPermission(PERMISSIONS.USER_ROLES_EDIT, async (
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) => {
  const { id } = await params;
  const body = await request.json();
  const { roleName } = body as { roleName: string | null };

  const user = await prisma.member.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) {
    return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '使用者不存在');
  }

  if (roleName !== null) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, `角色 ${roleName} 不存在`);
    }
  }

  const session = await auth();

  const updated = await prisma.member.update({
    where: { id },
    data: { role: roleName },
    select: { id: true, email: true, name: true, role: true },
  });

  await createAuditLog({
    actorId: session?.user?.memberId,
    actorEmail: session?.user?.email ?? undefined,
    actorName: session?.user?.name ?? undefined,
    entityType: 'Member',
    entityId: id,
    action: 'update',
    oldValue: { role: user.role },
    newValue: { role: updated.role },
    ipAddress: getIpFromRequest(request),
  });

  clearPermissionCache();

  return ApiResponse.ok(updated, '使用者角色已更新');
});
