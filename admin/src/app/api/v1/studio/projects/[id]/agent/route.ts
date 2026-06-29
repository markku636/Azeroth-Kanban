import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { withPermission } from '@/lib/with-permission';
import { hasPermission } from '@/lib/permission-service';
import { PERMISSIONS } from '@/config/permissions';
import { prisma } from '@/lib/prisma';
import { runAgentTurn, type AgentMessage, type AgentProvider } from '@/lib/studio/agent/runtime';

export const runtime = 'nodejs';
export const maxDuration = 120;

const PROVIDERS = new Set<AgentProvider>(['anthropic', 'vertex', 'claude-agent']);

// 主動 AI Agent 對話：讀專案 → 所選 provider 產生回覆 + 提案（不落庫，等使用者 apply）。
export const POST = withPermission(
  PERMISSIONS.STUDIO_EDIT,
  async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    const session = await auth();
    const memberId = session?.user?.memberId;
    if (!memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
    const { id } = await params;

    let body: { provider?: unknown; message?: unknown; history?: unknown };
    try { body = await request.json(); } catch { return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請求格式錯誤'); }
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return ApiResponse.fail(ApiReturnCode.VALIDATION_ERROR, '請輸入訊息');

    const bypass = await hasPermission(session.user.roles ?? [], PERMISSIONS.STUDIO_EDIT_ALL);
    const project = await prisma.studioProject.findFirst({
      where: bypass ? { id } : { id, ownerId: memberId },
      select: { id: true, agentProvider: true },
    });
    if (!project) return ApiResponse.fail(ApiReturnCode.NOT_FOUND, '找不到此專案');

    const reqProvider = typeof body.provider === 'string' ? body.provider : undefined;
    const provider: AgentProvider = (reqProvider && PROVIDERS.has(reqProvider as AgentProvider))
      ? (reqProvider as AgentProvider)
      : (project.agentProvider && PROVIDERS.has(project.agentProvider as AgentProvider) ? (project.agentProvider as AgentProvider) : 'anthropic');

    const history: AgentMessage[] = Array.isArray(body.history)
      ? (body.history as unknown[])
          .filter((m): m is { role?: unknown; content?: unknown } => !!m && typeof (m as { content?: unknown }).content === 'string')
          .map((m) => ({ role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: String(m.content) }))
          .slice(-12)
      : [];

    try {
      const result = await runAgentTurn({ projectId: id, ownerId: memberId, bypass, provider, history, message });
      return ApiResponse.ok(result, 'ok');
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      const friendly = /api[\s_-]?key|anthropic|authentication|unauthor|credential|vertex/i.test(raw)
        ? 'AI 未啟用：請設定對應供應商憑證（Claude：ANTHROPIC_API_KEY / Gemini：GOOGLE_VERTEX_*）'
        : 'AI 回應失敗，請稍後再試' + (raw ? `：${raw}` : '');
      return ApiResponse.fail(ApiReturnCode.INTERNAL_ERROR, friendly);
    }
  },
);
