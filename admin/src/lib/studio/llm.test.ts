import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vertexConfigured 用 hoisted mock 控制；@langchain/anthropic 只 stub 掉避免載入重 SDK。
const { vertexConfigured } = vi.hoisted(() => ({ vertexConfigured: vi.fn() }));
vi.mock('./vertex', () => ({ vertexConfigured, generateText: vi.fn() }));
vi.mock('@langchain/anthropic', () => ({ ChatAnthropic: class {} }));

import { resolveProvider, providerConfigured, anyLlmConfigured } from './llm';

const ENV_KEYS = ['LLM_PROVIDER', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  vertexConfigured.mockReturnValue(false);
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe('resolveProvider', () => {
  it('LLM_PROVIDER=vertex → vertex（大小寫/空白不敏感）', () => {
    process.env.LLM_PROVIDER = ' Vertex ';
    expect(resolveProvider()).toBe('vertex');
  });
  it('未設定 → anthropic（向後相容預設）', () => {
    expect(resolveProvider()).toBe('anthropic');
  });
  it('其他值 → anthropic', () => {
    process.env.LLM_PROVIDER = 'openai';
    expect(resolveProvider()).toBe('anthropic');
  });
});

describe('providerConfigured', () => {
  it('anthropic：有 API key → true', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-x';
    expect(providerConfigured('anthropic')).toBe(true);
  });
  it('anthropic：有 AUTH_TOKEN（OAuth/訂閱）→ true', () => {
    process.env.ANTHROPIC_AUTH_TOKEN = 'tok';
    expect(providerConfigured('anthropic')).toBe(true);
  });
  it('anthropic：都沒有 → false', () => {
    expect(providerConfigured('anthropic')).toBe(false);
  });
  it('vertex：依 vertexConfigured()', () => {
    vertexConfigured.mockReturnValue(true);
    expect(providerConfigured('vertex')).toBe(true);
    vertexConfigured.mockReturnValue(false);
    expect(providerConfigured('vertex')).toBe(false);
  });
  it('預設參數用 resolveProvider 決定要查哪個', () => {
    process.env.LLM_PROVIDER = 'vertex';
    vertexConfigured.mockReturnValue(true);
    expect(providerConfigured()).toBe(true);
  });
});

describe('anyLlmConfigured', () => {
  it('任一可用 → true（vertex 可用）', () => {
    vertexConfigured.mockReturnValue(true);
    expect(anyLlmConfigured()).toBe(true);
  });
  it('任一可用 → true（anthropic 可用）', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-x';
    expect(anyLlmConfigured()).toBe(true);
  });
  it('都不可用 → false', () => {
    expect(anyLlmConfigured()).toBe(false);
  });
});
