/**
 * Claude Code CLI 子程序推理（@anthropic-ai/claude-agent-sdk 的 query()）。
 *
 * 授權：優先用環境變數（ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN）；
 * 若都沒設，仍會嘗試呼叫——此時 `query()` 會沿用本機已登入的 `claude` CLI session。
 * 失敗（未登入 / 子程序錯誤 / 逾時）回 null，由呼叫端降級。
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { config } from '../config.js';
import { log } from '../logger.js';

/** 是否設了環境變數授權（CLI session 登入時即使回 false 仍可能可用）。 */
export function isClaudeAvailable(): boolean {
  return Boolean(config.claude.apiKey || config.claude.oauthToken);
}

export interface ClaudeReasonOptions {
  maxTurns?: number;
  /** 模型，預設讓 SDK 用其預設 */
  model?: string;
  /** 逾時（毫秒），預設 180s */
  timeoutMs?: number;
}

const TIMEOUT = Symbol('claude-timeout');

/**
 * 用 Claude 做一次性推理 / 撰稿，回傳最終文字。
 * 以 plan 模式執行（唯讀，不動檔案系統）以策安全。
 */
export async function claudeReason(
  prompt: string,
  opts: ClaudeReasonOptions = {},
): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  let q: ReturnType<typeof query> | undefined;

  const run = (async () => {
    let result: string | null = null;
    q = query({
      prompt,
      options: {
        ...(opts.model ? { model: opts.model } : {}),
        maxTurns: opts.maxTurns ?? 4,
        permissionMode: 'plan',
      },
    });
    for await (const message of q) {
      if (message.type === 'result' && message.subtype === 'success') {
        result = message.result;
      }
    }
    return result;
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
  });

  try {
    const r = await Promise.race([run, timeout]);
    if (r === TIMEOUT) {
      log.warn('claudeReason 逾時');
      try {
        await q?.interrupt?.();
      } catch {
        /* ignore */
      }
      return null;
    }
    return r;
  } catch (e) {
    log.error('claudeReason 失敗', { error: (e as Error).message });
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
