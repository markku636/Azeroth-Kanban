import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permission-service';

/**
 * Server-side per-page RBAC guard.
 *
 * - 未登入 → redirect /login
 * - 登入但缺 permission → redirect /kanban
 *
 * 用於 server `layout.tsx`：
 *   await requirePermission(PERMISSIONS.ROLES_VIEW);
 */
export async function requirePermission(code: string): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }
  const roles = (session.user.roles ?? []) as string[];
  const ok = await hasPermission(roles, code);
  if (!ok) {
    redirect('/kanban');
  }
}
