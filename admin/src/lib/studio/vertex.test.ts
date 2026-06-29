import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vertexConfigured } from './vertex';

// vertexConfigured = 有 GOOGLE_VERTEX_PROJECT 且能載入有效的 service account JSON。
const ENV_KEYS = ['GOOGLE_VERTEX_PROJECT', 'GOOGLE_VERTEX_CREDENTIALS', 'GOOGLE_APPLICATION_CREDENTIALS'] as const;
const VALID_SA = JSON.stringify({ client_email: 'svc@proj.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n' });
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe('vertexConfigured', () => {
  it('沒有 project 與憑證 → false', () => {
    expect(vertexConfigured()).toBe(false);
  });

  it('只有 project、沒有憑證 → false', () => {
    process.env.GOOGLE_VERTEX_PROJECT = 'my-proj';
    expect(vertexConfigured()).toBe(false);
  });

  it('project + 有效 inline 憑證 → true', () => {
    process.env.GOOGLE_VERTEX_PROJECT = 'my-proj';
    process.env.GOOGLE_VERTEX_CREDENTIALS = VALID_SA;
    expect(vertexConfigured()).toBe(true);
  });

  it('有憑證但沒有 project → false', () => {
    process.env.GOOGLE_VERTEX_CREDENTIALS = VALID_SA;
    expect(vertexConfigured()).toBe(false);
  });

  it('憑證 JSON 壞掉 → false（不丟例外）', () => {
    process.env.GOOGLE_VERTEX_PROJECT = 'my-proj';
    process.env.GOOGLE_VERTEX_CREDENTIALS = '{ not valid json';
    expect(vertexConfigured()).toBe(false);
  });

  it('憑證缺 private_key → false', () => {
    process.env.GOOGLE_VERTEX_PROJECT = 'my-proj';
    process.env.GOOGLE_VERTEX_CREDENTIALS = JSON.stringify({ client_email: 'x@y.com' });
    expect(vertexConfigured()).toBe(false);
  });
});
