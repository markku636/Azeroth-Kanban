import type { NextRequest } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { getStoryboard, type StudioActor } from '@/lib/studio-service';
import { getIpFromRequest } from '@/lib/audit-log-service';
import { applyProposals, type Proposal } from '@/lib/studio/agent/proposals';

function buildActor(session: Session, request: NextRequest): StudioActor {
  return {
    id: session.user.memberId,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ipAddress: getIpFromRequest(request),
  };
}

// 套用使用者核可的 agent 提案（逐筆落庫），回傳套用結果 + 最新分鏡看板。
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    let body: { proposals?: unknown };
    try { body = await request.json(); } catch { return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤'); }
    const proposals = Array.isArray(body.proposals) ? (body.proposals as Proposal[]) : [];
    if (!proposals.length) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '沒有要套用的提案');

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const outcome = await applyProposals(memberId, id, proposals, buildActor(session, request), { bypassOwnership: bypass });
    const sb = await getStoryboard(memberId, id, { bypassOwnership: bypass });
    return ApiResponse.ok({ ...outcome, storyboard: sb.data }, `已套用 ${outcome.applied} / ${proposals.length} 筆`);
  },
);
