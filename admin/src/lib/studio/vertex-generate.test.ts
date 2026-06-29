import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { generateText } from './vertex';

/* eslint-disable @typescript-eslint/no-explicit-any */
// 用真 RSA key 讓 JWT 簽章成功；fetch 全 stub：token 端回假 token、generateContent 端回排好的回應。
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const ENV_KEYS = ['GOOGLE_VERTEX_PROJECT', 'GOOGLE_VERTEX_CREDENTIALS', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_VERTEX_LOCATION', 'GOOGLE_VERTEX_MODEL'] as const;
type GenResp = { ok?: boolean; status?: number; body?: any };
let saved: Record<string, string | undefined>;
let genQueue: GenResp[];
let lastGenBody: any;

function candidate(text: string, finishReason = 'STOP'): GenResp {
  return { body: { candidates: [{ finishReason, content: { parts: [{ text }] } }] } };
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.GOOGLE_VERTEX_PROJECT = 'proj';
  process.env.GOOGLE_VERTEX_CREDENTIALS = JSON.stringify({ client_email: 'svc@proj.iam.gserviceaccount.com', private_key: privateKey });
  genQueue = [];
  lastGenBody = undefined;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }), text: async () => '' };
    }
    lastGenBody = JSON.parse(init.body);
    const r = genQueue.shift() ?? candidate('fallback');
    return { ok: r.ok !== false, status: r.status ?? 200, json: async () => r.body, text: async () => JSON.stringify(r.body ?? {}) };
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const opts = { system: 's', messages: [{ role: 'user' as const, content: 'hi' }] };

describe('vertex generateText', () => {
  it('正常回應 → 回傳文字', async () => {
    genQueue = [candidate('哈囉')];
    expect(await generateText(opts)).toBe('哈囉');
  });

  it('答案預算 = maxTokens + THINKING_RESERVE(2048)', async () => {
    genQueue = [candidate('ok')];
    await generateText({ ...opts, maxTokens: 1000 });
    expect(lastGenBody.generationConfig.maxOutputTokens).toBe(1000 + 2048);
  });

  it('空輸出+STOP 先發生 → 重試後拿到結果', async () => {
    genQueue = [candidate('', 'STOP'), candidate('第二次成功')];
    expect(await generateText(opts)).toBe('第二次成功');
  });

  it('空輸出 + finishReason=MAX_TOKENS → 直接丟錯（重試無益）', async () => {
    genQueue = [candidate('', 'MAX_TOKENS')];
    await expect(generateText(opts)).rejects.toThrow(/MAX_TOKENS/);
  });

  it('連續三次空輸出 → 回空字串（用盡重試）', async () => {
    genQueue = [candidate('', 'STOP'), candidate('', 'STOP'), candidate('', 'STOP')];
    expect(await generateText(opts)).toBe('');
  });

  it('非 2xx → 丟出不外洩細節的錯誤', async () => {
    genQueue = [{ ok: false, status: 500, body: { error: 'secret quota detail' } }];
    await expect(generateText(opts)).rejects.toThrow(/Vertex 生成失敗（500）/);
  });
});
