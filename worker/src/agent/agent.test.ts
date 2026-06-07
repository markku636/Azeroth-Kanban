import { describe, it, expect, vi } from 'vitest';
import type { StockOhlcv } from '@azeroth/common';

// 測試環境：無 LLM 授權，Claude 研究失敗 → 走資料摘要降級。
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x';

function synth(n: number): StockOhlcv[] {
  const out: StockOhlcv[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const open = p;
    p += 0.6;
    out.push({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      open, high: p + 1, low: open - 1, close: p, volume: 1_000_000 + i * 500,
    });
  }
  return out;
}

// mock db，避免任何真實 Prisma 連線
vi.mock('../db.js', () => ({ prisma: {} }));
// mock 資料層，避免打網路
vi.mock('../data/cache.js', () => ({
  loadKline: vi.fn(async () => synth(80)),
  getCachedKline: vi.fn(async () => synth(80)),
  upsertDailyPrices: vi.fn(async () => 0),
}));
vi.mock('../data/finmind.js', () => ({
  fetchStockNews: vi.fn(async () => [
    { title: '測試新聞', url: 'https://example.com/n1', publisher: '測試來源', publishedAt: '2026-06-04' },
  ]),
  fetchInstitutionalTrades: vi.fn(async () => [
    { date: '2026-06-04', symbol: '2330', name: '外資', buy: 100, sell: 40, net: 60 },
  ]),
  fetchDailyKline: vi.fn(async () => synth(80)),
}));
// mock Claude：回 null（未就緒）→ claudeResearch 拋錯 → runResearchAgent 走 fallback
vi.mock('../llm/claude.js', () => ({
  claudeReason: vi.fn(async () => null),
  isClaudeAvailable: vi.fn(() => false),
}));

describe('runResearchAgent 降級路徑（Claude 不可用）', () => {
  it('回傳資料摘要報告', async () => {
    const { runResearchAgent } = await import('./deepAgent.js');
    const report = await runResearchAgent('2330');
    expect(report.symbol).toBe('2330');
    expect(report.body).toContain('研究報告');
    expect(report.body).toContain('技術面');
    expect(Array.isArray(report.sources)).toBe(true);
    expect(report.body).toContain('非投資建議');
  }, 30000);
});
