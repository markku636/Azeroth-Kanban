/**
 * POST /api/v1/monitors/[id]/check —— 立即執行一次監控檢查。
 *
 * 走完整的 gate(維護視窗/活躍時段/相依抑制)→ 寫 MonitorCheck → 套狀態機。
 * 用於 UI 詳情頁的「立即執行」按鈕,讓使用者不必等下個 tick。
 */
import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { PERMISSIONS } from '@/config/permissions';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { runOnce } from '@/lib/monitor-engine';
import { withPermission } from '@/lib/with-permission';

type RouteCtx = { params: Promise<Record<string, string>> };

export const POST = withPermission(
  PERMISSIONS.MONITORS_EDIT,
  async (_request: NextRequest, { params }: RouteCtx) => {
    const session = await auth();
    if (!session?.user?.memberId) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    }
    const { id } = await params;
    try {
      const result = await runOnce(id);
      if (!result) {
        return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '找不到監控');
      }
      return ApiResponse.ok(result, '立即執行成功');
    } catch (e) {
      console.error('[api.monitors.check]', e);
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, '立即執行失敗');
    }
  },
);
