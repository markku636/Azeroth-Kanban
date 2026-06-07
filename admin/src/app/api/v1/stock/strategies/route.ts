import { ApiResponse } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { PERMISSIONS } from '@/config/permissions';
import { listStrategies } from '@azeroth/common';

/** 內建評分策略清單（給前端策略下拉）。 */
export const GET = withPermission(PERMISSIONS.STOCK_SIGNAL_VIEW, async () => {
  return ApiResponse.json(ApiResponse.success(listStrategies()));
});
