import { describe, it, expect, vi, beforeEach } from 'vitest';

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { studioProject: { findUnique: vi.fn() }, shot: { findMany: vi.fn() } } }));
vi.mock('./llm', () => ({ complete }));
vi.mock('./story-context', () => ({ buildStoryContext: vi.fn() }));

import { suggestShots } from './shot-assist';
import { prisma } from '@/lib/prisma';
import { buildStoryContext } from './story-context';

/* eslint-disable @typescript-eslint/no-explicit-any */
let captured = '';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildStoryContext as any).mockResolvedValue({ preamble: '', system: '' });
  vi.mocked(prisma.studioProject.findUnique as any).mockResolvedValue({ title: 'P' });
  vi.mocked(prisma.shot.findMany as any).mockResolvedValue([]);
  complete.mockImplementation((o: any) => { captured = o.messages[0].content; return Promise.resolve('[]'); });
});

describe('suggestShots', () => {
  it('結果數量上限為 count（AI 回多也截斷）', async () => {
    complete.mockResolvedValue(JSON.stringify([{ visual: 'a' }, { visual: 'b' }, { visual: 'c' }, { visual: 'd' }, { visual: 'e' }]));
    const shots = await suggestShots('p', { count: 2 });
    expect(shots).toHaveLength(2);
    expect(shots.map((s) => s.visual)).toEqual(['a', 'b']);
  });

  it('把既有分鏡放進脈絡（延續用）', async () => {
    vi.mocked(prisma.shot.findMany as any).mockResolvedValue([{ shotNo: 1, visual: '既有鏡', tts: null, caption: null }]);
    await suggestShots('p', { count: 1 });
    expect(captured).toContain('#1 既有鏡');
  });

  it('帶入使用者想法 hint', async () => {
    await suggestShots('p', { count: 1, hint: '加個轉折' });
    expect(captured).toContain('使用者想法／方向：加個轉折');
  });

  it('count=1 用單鏡指令、count>1 用多鏡指令', async () => {
    await suggestShots('p', { count: 1 });
    expect(captured).toContain('共 1 個分鏡');
    await suggestShots('p', { count: 3 });
    expect(captured).toContain('續寫接下來的 3 個分鏡');
  });

  it('沒有既有分鏡 → 提示這是開頭', async () => {
    await suggestShots('p', { count: 1 });
    expect(captured).toContain('尚無分鏡');
  });
});
