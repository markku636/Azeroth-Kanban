import { describe, it, expect, vi, beforeEach } from 'vitest';

// 驗證 R74 的「長片取前 20 + 後 10 鏡」取樣：餵給模型的 prompt 該涵蓋頭尾、標出中段省略與真總數。
vi.mock('@/lib/prisma', () => ({
  prisma: {
    studioProject: { findUnique: vi.fn() },
    shot: { count: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock('./llm', () => ({ complete: vi.fn() }));
vi.mock('./story-context', () => ({ buildStoryContext: vi.fn() }));

import { generateYouTubeMeta } from './youtube-meta';
import { prisma } from '@/lib/prisma';
import { complete } from './llm';
import { buildStoryContext } from './story-context';

/* eslint-disable @typescript-eslint/no-explicit-any */
const META_JSON = '{"title":"T","thumbnailText":"x","description":"d","hashtags":["#a"],"pinnedComment":"p"}';
let captured = '';

beforeEach(() => {
  vi.clearAllMocks();
  captured = '';
  vi.mocked(prisma.studioProject.findUnique as any).mockResolvedValue({ title: 'P', premise: null, logline: null, tone: null, genre: null, targetAudience: null });
  vi.mocked(buildStoryContext as any).mockResolvedValue({ preamble: '', system: '' });
  vi.mocked(complete as any).mockImplementation((o: any) => { captured = o.messages[0].content; return Promise.resolve(META_JSON); });
});

describe('generateYouTubeMeta 長片取樣 (R74)', () => {
  it('超過 30 鏡：餵頭 20 + 尾 10、標中段省略與真總數', async () => {
    vi.mocked(prisma.shot.count as any).mockResolvedValue(35);
    vi.mocked(prisma.shot.findMany as any).mockImplementation((args: any) =>
      Promise.resolve(
        args?.orderBy?.sortOrder === 'desc'
          ? Array.from({ length: 10 }, (_, i) => ({ shotNo: 35 - i, tts: `t${35 - i}`, caption: null, punchline: null }))
          : Array.from({ length: 20 }, (_, i) => ({ shotNo: i + 1, tts: `t${i + 1}`, caption: null, punchline: null })),
      ),
    );

    await generateYouTubeMeta('proj1');

    expect(prisma.shot.findMany).toHaveBeenCalledTimes(2); // head + tail
    expect(captured).toContain('全片共 35 鏡');
    expect(captured).toContain('中段省略');
    expect(captured).toContain('#1 ');   // 頭
    expect(captured).toContain('#35 ');  // 尾
    expect(captured).not.toContain('#23 '); // 中段被省略
  });

  it('30 鏡以內：一次撈全部、不標省略', async () => {
    vi.mocked(prisma.shot.count as any).mockResolvedValue(8);
    vi.mocked(prisma.shot.findMany as any).mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({ shotNo: i + 1, tts: `t${i + 1}`, caption: null, punchline: null })),
    );

    await generateYouTubeMeta('proj1');

    expect(prisma.shot.findMany).toHaveBeenCalledTimes(1);
    expect(captured).not.toContain('中段省略');
    expect(captured).toContain('#8 ');
  });
});

describe('generateYouTubeMeta 輸出正規化', () => {
  it('hashtags 自動補 # 並上限 8 個；title 去頭尾空白', async () => {
    vi.mocked(prisma.shot.count as any).mockResolvedValue(3);
    vi.mocked(prisma.shot.findMany as any).mockResolvedValue([{ shotNo: 1, tts: 't', caption: null, punchline: null }]);
    vi.mocked(complete as any).mockResolvedValue(JSON.stringify({
      title: '  吸睛標題  ', thumbnailText: 'x', description: 'd',
      hashtags: ['a', '#b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
      pinnedComment: 'p',
    }));
    const meta = await generateYouTubeMeta('proj1');
    expect(meta.hashtags.length).toBeLessThanOrEqual(8);
    expect(meta.hashtags.every((h) => h.startsWith('#'))).toBe(true);
    expect(meta.title).toBe('吸睛標題');
  });
});
