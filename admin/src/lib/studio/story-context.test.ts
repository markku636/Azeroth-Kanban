import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: { studioProject: { findUnique: vi.fn() } } }));

import { buildStoryContext } from './story-context';
import { prisma } from '@/lib/prisma';

/* eslint-disable @typescript-eslint/no-explicit-any */
const baseProject = (over: Record<string, any> = {}) => ({
  title: 'T', description: null, logline: null, premise: null, worldSetting: null,
  styleGuide: null, tone: null, genre: null, targetAudience: null, bibleNotes: null,
  projectCharacters: [], ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('buildStoryContext', () => {
  it('找不到專案 → 空脈絡', async () => {
    vi.mocked(prisma.studioProject.findUnique as any).mockResolvedValue(null);
    expect(await buildStoryContext('p')).toEqual({ system: '', preamble: '' });
  });

  it('prisma 例外 → 空脈絡（向後相容、不丟錯）', async () => {
    vi.mocked(prisma.studioProject.findUnique as any).mockRejectedValue(new Error('db down'));
    expect(await buildStoryContext('p')).toEqual({ system: '', preamble: '' });
  });

  it('完全空白的聖經（無欄位無角色）→ 空脈絡', async () => {
    vi.mocked(prisma.studioProject.findUnique as any).mockResolvedValue(baseProject());
    expect(await buildStoryContext('p')).toEqual({ system: '', preamble: '' });
  });

  it('有聖經欄位 → preamble 含欄位、system 非空', async () => {
    vi.mocked(prisma.studioProject.findUnique as any).mockResolvedValue(baseProject({ premise: '一個關於X的故事', genre: '喜劇' }));
    const ctx = await buildStoryContext('p');
    expect(ctx.system).toContain('故事聖經');
    expect(ctx.preamble).toContain('<故事聖經>');
    expect(ctx.preamble).toContain('核心前提：一個關於X的故事');
    expect(ctx.preamble).toContain('類型：喜劇');
    expect(ctx.preamble).toContain('</故事聖經>');
  });

  it('有角色 → preamble 含「登場角色」與定位/個性/外觀', async () => {
    vi.mocked(prisma.studioProject.findUnique as any).mockResolvedValue(baseProject({
      projectCharacters: [{ roleInStory: '主角', character: { name: '阿智', persona: '熱血', appearance: '紅帽', voiceInstruct: '激動' } }],
    }));
    const ctx = await buildStoryContext('p');
    expect(ctx.preamble).toContain('登場角色：');
    expect(ctx.preamble).toContain('- 阿智');
    expect(ctx.preamble).toContain('（主角）');
    expect(ctx.preamble).toContain('個性：熱血');
    expect(ctx.preamble).toContain('外觀：紅帽');
  });

  it('空白欄位（trim 後為空）不納入', async () => {
    vi.mocked(prisma.studioProject.findUnique as any).mockResolvedValue(baseProject({ premise: '   ', genre: '劇情' }));
    const ctx = await buildStoryContext('p');
    expect(ctx.preamble).not.toContain('核心前提');
    expect(ctx.preamble).toContain('類型：劇情');
  });
});
