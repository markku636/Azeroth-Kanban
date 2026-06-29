import { describe, it, expect, vi, beforeEach } from 'vitest';

// 驗證 R73：audit 必須用「全片總鏡數」餵模型（否則 >40 鏡的長度評分會誤判），並回報 truncated。
vi.mock('@/lib/prisma', () => ({
  prisma: {
    studioProject: { findUnique: vi.fn() },
    shot: { findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock('./llm', () => ({ complete: vi.fn() }));
vi.mock('./story-context', () => ({ buildStoryContext: vi.fn() }));

import { auditStoryboard } from './storyboard-audit';
import { prisma } from '@/lib/prisma';
import { complete } from './llm';
import { buildStoryContext } from './story-context';

/* eslint-disable @typescript-eslint/no-explicit-any */
const AUDIT_JSON = '{"score":55,"verdict":"不錯，再磨一下","strengths":["鉤子強"],"issues":[],"suggestedTitle":"更吸睛的標題"}';
let captured = '';

function shots(n: number) {
  return Array.from({ length: n }, (_, i) => ({ shotNo: i + 1, visual: `v${i + 1}`, tts: `t${i + 1}`, caption: null, punchline: null, branch: 'A', punch: false }));
}

beforeEach(() => {
  vi.clearAllMocks();
  captured = '';
  vi.mocked(prisma.studioProject.findUnique as any).mockResolvedValue({ title: 'P', logline: null, premise: null });
  vi.mocked(buildStoryContext as any).mockResolvedValue({ preamble: '', system: '' });
  vi.mocked(complete as any).mockImplementation((o: any) => { captured = o.messages[0].content; return Promise.resolve(AUDIT_JSON); });
});

describe('auditStoryboard 長度修正 (R73)', () => {
  it('超過 40 鏡：truncated=true，prompt 用全片總數', async () => {
    vi.mocked(prisma.shot.findMany as any).mockResolvedValue(shots(40)); // take:40
    vi.mocked(prisma.shot.count as any).mockResolvedValue(50);
    const audit = await auditStoryboard('proj1');
    expect(audit.truncated).toBe(true);
    expect(captured).toContain('全片分鏡總數：50');
    expect(captured).toContain('前 40 鏡');
    expect(audit.score).toBe(55);
  });

  it('40 鏡以內：truncated=false，不標省略', async () => {
    vi.mocked(prisma.shot.findMany as any).mockResolvedValue(shots(12));
    vi.mocked(prisma.shot.count as any).mockResolvedValue(12);
    const audit = await auditStoryboard('proj1');
    expect(audit.truncated).toBe(false);
    expect(captured).toContain('全片分鏡總數：12');
    expect(captured).not.toContain('前 40 鏡');
  });

  it('模型回空字串時重試後仍回安全預設（含 truncated）', async () => {
    vi.mocked(prisma.shot.findMany as any).mockResolvedValue(shots(40)); // take:40 → 最多 40 筆
    vi.mocked(prisma.shot.count as any).mockResolvedValue(45);
    vi.mocked(complete as any).mockResolvedValue(''); // 兩次都空
    const audit = await auditStoryboard('proj1');
    expect(audit.verdict).toBe('');
    expect(audit.issues).toEqual([]);
    expect(audit.truncated).toBe(true);
  });
});
