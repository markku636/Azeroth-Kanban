import { auth } from '@/auth';
import { ApiResponse, ApiReturnCode } from '@/lib/api-response';
import { anyLlmConfigured, providerConfigured, resolveProvider } from '@/lib/studio/llm';

export const dynamic = 'force-dynamic';

// 前端用：回報 AI 是否可用＋目前 LLM_PROVIDER＋各 agent 供應商是否已備齊憑證（給面板 provider 切換用）
export async function GET() {
  const session = await auth();
  if (!session?.user?.memberId) return ApiResponse.fail(ApiReturnCode.UNAUTHORIZED, '尚未登入');
  const anthropic = providerConfigured('anthropic');
  const vertex = providerConfigured('vertex');
  return ApiResponse.ok(
    {
      aiEnabled: anyLlmConfigured(),
      provider: resolveProvider(),
      providers: {
        anthropic,
        vertex,
        // Claude Agent 走 Claude 引擎（深度 Agent SDK 模式需 AGENT_SDK_ENABLED）。
        claudeAgent: anthropic,
        agentSdk: process.env.AGENT_SDK_ENABLED === '1',
      },
    },
    'ok',
  );
}
