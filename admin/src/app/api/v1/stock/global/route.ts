import { ApiResponse } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { getGlobalMarket, triggerGlobalMarket } from '@/lib/stock-service';

export const GET = withPermission(PERMISSIONS.STOCK_SIGNAL_VIEW, async () => {
  return ApiResponse.json(await getGlobalMarket());
});

export const POST = withPermission(PERMISSIONS.STOCK_BOT_ADMIN, async () => {
  return ApiResponse.json(await triggerGlobalMarket());
});
