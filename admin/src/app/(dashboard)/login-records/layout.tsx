import { requirePermission } from '@/lib/require-permission';
import { PERMISSIONS } from '@/config/permissions';

export default async function LoginRecordsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PERMISSIONS.LOGIN_RECORDS_VIEW);
  return <>{children}</>;
}
