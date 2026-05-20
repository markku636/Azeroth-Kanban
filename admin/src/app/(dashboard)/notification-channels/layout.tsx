import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/require-permission';

export default async function NotificationChannelsLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PERMISSIONS.NOTIFICATION_CHANNELS_VIEW);
  return <>{children}</>;
}
