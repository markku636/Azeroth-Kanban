import { requirePermission } from '@/lib/require-permission';
import { PERMISSIONS } from '@/config/permissions';

export default async function UserRolesLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PERMISSIONS.USER_ROLES_VIEW);
  return <>{children}</>;
}
