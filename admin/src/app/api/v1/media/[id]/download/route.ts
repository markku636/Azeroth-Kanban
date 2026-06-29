import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getMediaForDownload } from '@/lib/media-service';
import { getSignedReadUrl } from '@/lib/media-storage';

export const runtime = 'nodejs';

// 以原始檔名下載：簽 attachment presigned URL 後 302 導向（owner 把關，可被 view_all bypass）。
export const GET = withPermission(
  PERMISSIONS.MEDIA_VIEW,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;
    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.MEDIA_VIEW_ALL);
    const res = await getMediaForDownload(id, memberId, { bypassOwnership: bypass });
    // 此 route 由 <a href> 全頁導覽觸發（非 fetch）→ 失敗別回 raw JSON，導回媒體庫頁
    if (res.code !== ApiReturnCode.SUCCESS || !res.data) {
      return NextResponse.redirect(new URL('/media', request.url), 302);
    }
    const url = await getSignedReadUrl(res.data.key, { download: true, fileName: res.data.fileName });
    return NextResponse.redirect(url, 302);
  },
);
