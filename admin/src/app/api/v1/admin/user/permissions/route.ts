import { auth } from '@/auth';
import { getUserPermissions } from '@/lib/permission-service';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';

/**
 * GET /api/v1/admin/user/permissions - 取得當前登入使用者的權限列表
 * 供前端快取使用，不需額外權限檢查
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '未登入');
  }

  const roles = (session.user as { roles?: string[] }).roles ?? [];
  const permissions = await getUserPermissions(roles);

  return ApiResponse.ok(permissions, '取得使用者權限成功');
}
