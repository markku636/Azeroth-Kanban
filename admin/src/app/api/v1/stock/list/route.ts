import { ApiResponse } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { getStockList } from '@/lib/stock-service';

export const GET = withPermission(PERMISSIONS.STOCK_SIGNAL_VIEW, async () => {
  return ApiResponse.json(await getStockList());
});
