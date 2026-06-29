import { describe, it, expect, vi, beforeEach } from 'vitest';

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { scene: { findUnique: vi.fn() } } }));
vi.mock('./llm', () => ({ complete }));
vi.mock('./story-context', () => ({ buildStoryContext: vi.fn() }));

import { polishSceneField } from './scene-assist';
import { prisma } from '@/lib/prisma';
import { buildStoryContext } from './story-context';

/* eslint-disable @typescript-eslint/no-explicit-any */
let captured = '';

beforeEach(() => {
  vi.clearAllMocks();
  complete.mockImplementation((o: any) => { captured = o.messages[0].content; return Promise.resolve('out'); });
  vi.mocked(buildStoryContext as any).mockResolvedValue({ preamble: '', system: '' });
  vi.mocked(prisma.scene.findUnique as any).mockResolvedValue({ projectId: 'p', title: '第一場', synopsis: '本場的劇情概要', dialogue: '舊台詞' });
});

describe('polishSceneField', () => {
  it('找不到場景 → null（供路由回 404）', async () => {
    vi.mocked(prisma.scene.findUnique as any).mockResolvedValue(null);
    expect(await polishSceneField('s', 'synopsis', 'x')).toBeNull();
  });

  it('清掉 AI 輸出的 fence/引號', async () => {
    complete.mockResolvedValue('```\n「乾淨」\n```');
    expect(await polishSceneField('s', 'synopsis', 'x')).toBe('乾淨');
  });

  it('潤飾 dialogue 時帶入本場 synopsis 當脈絡', async () => {
    await polishSceneField('s', 'dialogue', '編輯中的台詞');
    expect(captured).toContain('本場劇情概要：本場的劇情概要');
    expect(captured).toContain('編輯中的台詞');
  });

  it('潤飾 synopsis 時不把舊 synopsis 當脈絡（它是改寫目標）', async () => {
    await polishSceneField('s', 'synopsis', '新編輯中的概要');
    expect(captured).toContain('新編輯中的概要');
    expect(captured).not.toContain('本場劇情概要：');
  });
});
