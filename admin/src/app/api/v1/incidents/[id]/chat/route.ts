/**
 * /api/v1/incidents/[id]/chat —— 事故詳情頁「追問 Selkie」面板
 *   GET  列出對話訊息(使用者問句 + Selkie 回覆)
 *   POST 送出一則追問,同步等待 Selkie 回覆後回傳
 */
import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { PERMISSIONS } from '@/config/permissions';
import { listAgentMessages, sendAgentMessage } from '@/lib/agent-chat-service';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { hasPermission } from '@/lib/permission-service';
import { withPermission } from '@/lib/with-permission';

type RouteCtx = { params: Promise<Record<string, string>> };

/** GET —— 列出某事故的對話訊息 */
export const GET = withPermission(
  PERMISSIONS.INCIDENTS_VIEW,
  async (_request: NextRequest, { params }: RouteCtx) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    }
    const { id } = await params;
    const roles = (session.user as { roles?: string[] }).roles ?? [];
    const canViewAll = await hasPermission(roles, PERMISSIONS.INCIDENTS_VIEW_ALL);
    return ApiResponse.json(await listAgentMessages(memberId, id, canViewAll));
  },
);

/** POST —— 送出一則追問給 Selkie */
export const POST = withPermission(
  PERMISSIONS.INCIDENTS_TRIAGE,
  async (request: NextRequest, { params }: RouteCtx) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) {
      return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    }
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤');
    }
    const content =
      body && typeof body === 'object' && 'content' in body
        ? String((body as { content: unknown }).content ?? '')
        : '';
    const roles = (session.user as { roles?: string[] }).roles ?? [];
    const canViewAll = await hasPermission(roles, PERMISSIONS.INCIDENTS_VIEW_ALL);
    return ApiResponse.json(await sendAgentMessage(memberId, id, content, canViewAll));
  },
);
