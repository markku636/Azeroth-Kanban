/**
 * API 路由權限裝飾器
 * 包裝 API route handler，自動檢查使用者角色是否有對應權限
 */

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permission-service';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => Promise<Response>;

/**
 * 包裝 route handler，自動檢查權限
 *
 * @example
 * export const GET = withPermission('platforms.view', async (request) => {
 *   // 已通過權限檢查
 *   return ApiResponse.ok(data);
 * });
 */
export function withPermission(permissionCode: string, handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    // 1. 取得 session
    const session = await auth();
    if (!session?.user) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '未登入');
    }

    // 2. 檢查權限
    const roles = (session.user as { roles?: string[] }).roles ?? [];
    const allowed = await hasPermission(roles, permissionCode);
    if (!allowed) {
      return ApiResponse.fail(ApiReturnCode.FORBIDDEN, `缺少權限: ${permissionCode}`);
    }

    // 3. 執行原始 handler
    return handler(request, context);
  };
}
