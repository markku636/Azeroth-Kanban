import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { listMedia } from '@/lib/media-service';
import type { MediaKind } from '@/lib/media-storage';

export const runtime = 'nodejs';

const KINDS: readonly MediaKind[] = ['image', 'video', 'audio', 'file'];

// 列出媒體（owner 隔離；具 media.view_all 則跨 owner）。?kind=image|video|audio|file 可篩選。
export const GET = withPermission(PERMISSIONS.MEDIA_VIEW, async (request: NextRequest) => {
  const session = await auth();
  const memberId = session?.user?.memberId;
  if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  const all = await hasPermission(session.user.roles ?? [], PERMISSIONS.MEDIA_VIEW_ALL);
  const kindParam = new URL(request.url).searchParams.get('kind');
  const kind = kindParam && (KINDS as readonly string[]).includes(kindParam) ? (kindParam as MediaKind) : undefined;
  return ApiResponse.json(await listMedia(memberId, all, kind));
});
