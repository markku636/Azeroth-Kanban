import { prisma } from '@/lib/prisma';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { auth } from '@/auth';

/**
 * GET /api/v1/admin/me - 取得當前登入者資料
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '未登入');
  }

  const memberId = session.user.memberId;
  if (!memberId) {
    return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, '無法取得使用者 ID');
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!member) {
    return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '找不到使用者資料');
  }

  return ApiResponse.ok(member, '取得個人資料成功');
}
