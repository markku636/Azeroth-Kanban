import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/require-permission';

/** 事故功能的 per-page RBAC 守衛：需 incidents.view 權限。 */
export default async function IncidentsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PERMISSIONS.INCIDENTS_VIEW);
  return <>{children}</>;
}
