import { ApiResponse } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { triggerScreen } from '@/lib/stock-service';

export const POST = withPermission(PERMISSIONS.STOCK_BOT_ADMIN, async () => {
  return ApiResponse.json(await triggerScreen());
});
