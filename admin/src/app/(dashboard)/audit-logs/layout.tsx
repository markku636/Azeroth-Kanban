import { requirePermission } from '@/lib/require-permission';
import { PERMISSIONS } from '@/config/permissions';

export default async function AuditLogsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PERMISSIONS.AUDIT_LOGS_VIEW);
  return <>{children}</>;
}
