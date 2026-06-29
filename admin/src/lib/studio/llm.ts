import { ChatAnthropic } from '@langchain/anthropic';
import { generateText as vertexGenerate, vertexConfigured } from './vertex';

// 可切換的 studio LLM 抽象層。由 LLM_PROVIDER 環境變數選 provider：
//   anthropic（預設，向後相容；用既有 ANTHROPIC_API_KEY + LLM_MODEL）
//   vertex   （Gemini on Vertex AI；見 vertex.ts 的設定）
// 訪談（planStoryboard/chatStoryboard）與新增分鏡協助（shot-assist）都走這裡，
// 因此設 LLM_PROVIDER=vertex 即可整套切到 Gemini。

export type LlmProvider = 'anthropic' | 'vertex';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 目前選用的 provider（LLM_PROVIDER，預設 anthropic）。 */
export function resolveProvider(): LlmProvider {
  return (process.env.LLM_PROVIDER ?? '').trim().toLowerCase() === 'vertex' ? 'vertex' : 'anthropic';
}

/** Anthropic 認證可擇一：ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN（OAuth / 訂閱）。 */
function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** 指定 provider 是否已備齊憑證。 */
export function providerConfigured(provider: LlmProvider = resolveProvider()): boolean {
  return provider === 'vertex' ? vertexConfigured() : anthropicConfigured();
}

/** 任一 provider 可用（給 /config 的 aiEnabled 判斷）。 */
export function anyLlmConfigured(): boolean {
  return anthropicConfigured() || vertexConfigured();
}

/**
 * 單次補全：system 指令 + 對話訊息 → 純文字。依 provider 分流。
 * `opts.model` 為單次模型覆寫，目前**只有 vertex 分支會吃**（角色魔法棒選的 Gemini 模型）；
 * anthropic 分支刻意忽略它（仍用 LLM_MODEL）——魔法棒一律走 vertex，故不影響。
 */
export async function complete(
  opts: { system: string; messages: LlmMessage[]; temperature?: number; maxTokens?: number; model?: string },
  provider: LlmProvider = resolveProvider(),
): Promise<string> {
  if (provider === 'vertex') {
    return vertexGenerate({
      system: opts.system,
      messages: opts.messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      model: opts.model,
    });
  }
  // ANTHROPIC_AUTH_TOKEN（OAuth / 訂閱）與 ANTHROPIC_BASE_URL（自架 proxy）可選，直透底層 SDK。
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  const model = new ChatAnthropic({
    model: process.env.LLM_MODEL ?? 'claude-opus-4-8',
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
    ...(authToken || baseURL
      ? { clientOptions: { ...(authToken ? { authToken } : {}), ...(baseURL ? { baseURL } : {}) } }
      : {}),
  });
  // 用 [role, content] tuple 形式餵 langchain（BaseMessageLike 的 MessageTuple），避免物件型別不符。
  const lc: [string, string][] = [
    ['system', opts.system],
    ...opts.messages.map((m) => [m.role, m.content] as [string, string]),
  ];
  const res = await model.invoke(lc);
  return typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
}
