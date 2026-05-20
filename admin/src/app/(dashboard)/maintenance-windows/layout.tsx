import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/require-permission';

export default async function MaintenanceWindowsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PERMISSIONS.MAINTENANCE_WINDOWS_VIEW);
  return <>{children}</>;
}
