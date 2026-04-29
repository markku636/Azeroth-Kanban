import { requirePermission } from '@/lib/require-permission';
import { PERMISSIONS } from '@/config/permissions';

export default async function RolesLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PERMISSIONS.ROLES_VIEW);
  return <>{children}</>;
}
