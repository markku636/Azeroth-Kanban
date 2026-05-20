import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/require-permission';

export default async function MonitorsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PERMISSIONS.MONITORS_VIEW);
  return <>{children}</>;
}
