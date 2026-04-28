/**
 * 權限查詢服務（含 in-memory 快取）
 */

import { prisma } from '@/lib/prisma';

// ─── 快取 ───
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const permissionCache = new Map<string, { permissions: string[]; expiresAt: number }>();

/**
 * 清除權限快取
 */
export function clearPermissionCache(): void {
  permissionCache.clear();
}

/**
 * 取得使用者權限列表（根據角色）
 * 會查詢本地 DB 的 Role → RolePermission → Permission
 */
export async function getUserPermissions(roles: string[]): Promise<string[]> {
  if (!roles.length) {return [];}

  // 產生快取 key（排序後 join）
  const cacheKey = [...roles].sort().join(',');
  const cached = permissionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions;
  }

  // 從 DB 查詢
  const rolePermissions = await prisma.rolePermission.findMany({
    where: {
      role: { name: { in: roles } },
    },
    include: {
      permission: { select: { code: true } },
    },
  });

  const permissions = Array.from(new Set(rolePermissions.map((rp) => rp.permission.code)));

  // 寫入快取
  permissionCache.set(cacheKey, {
    permissions,
    expiresAt: Date.now() + CACHE_TTL,
  });

  return permissions;
}

/**
 * 檢查使用者是否有特定權限
 */
export async function hasPermission(roles: string[], permissionCode: string): Promise<boolean> {
  const permissions = await getUserPermissions(roles);
  return permissions.includes(permissionCode);
}

/**
 * 檢查使用者是否有任一權限
 */
export async function hasAnyPermission(roles: string[], codes: string[]): Promise<boolean> {
  const permissions = await getUserPermissions(roles);
  return codes.some((code) => permissions.includes(code));
}
