import { describe, it, expect, vi, beforeEach } from 'vitest';

// 測 polishShotField 對 AI 輸出的清理（cleanPolish）：常見的 code fence / 包覆引號要被去掉。
const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { studioProject: { findUnique: vi.fn() }, shot: { findMany: vi.fn() } } }));
vi.mock('./llm', () => ({ complete }));
vi.mock('./story-context', () => ({ buildStoryContext: vi.fn() }));

import { polishShotField, suggestShots } from './shot-assist';
import { prisma } from '@/lib/prisma';
import { buildStoryContext } from './story-context';

/* eslint-disable @typescript-eslint/no-explicit-any */
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildStoryContext as any).mockResolvedValue({ preamble: '', system: '' });
});

async function polishReturning(raw: string): Promise<string> {
  complete.mockResolvedValue(raw);
  return polishShotField('p', { field: 'tts', text: '原文' });
}

describe('polishShotField 清理 AI 輸出', () => {
  it('去掉 markdown code fence', async () => {
    expect(await polishReturning('```text\n潤飾後\n```')).toBe('潤飾後');
  });
  it('去掉包覆的半形引號', async () => {
    expect(await polishReturning('"潤飾後"')).toBe('潤飾後');
  });
  it('去掉包覆的全形引號「」', async () => {
    expect(await polishReturning('「潤飾後」')).toBe('潤飾後');
  });
  it('fence + 引號同時去掉', async () => {
    expect(await polishReturning('```\n"潤飾後的內容"\n```')).toBe('潤飾後的內容');
  });
  it('乾淨文字僅去頭尾空白', async () => {
    expect(await polishReturning('  乾淨的一句話  ')).toBe('乾淨的一句話');
  });
  it('不會去掉句中的引號（只去包覆的）', async () => {
    expect(await polishReturning('他說「你好」然後走了')).toBe('他說「你好」然後走了');
  });
});

describe('suggestShots 續寫脈絡帶入既有分鏡的 visual 錨點（角色/畫風一致性）', () => {
  it('喜劇鏡(有 caption)也把 visual 餵進脈絡，不會只剩 caption 而讓角色/畫風飄掉', async () => {
    vi.mocked(prisma.studioProject.findUnique as any).mockResolvedValue({ title: '片' });
    vi.mocked(prisma.shot.findMany as any).mockResolvedValue([
      { shotNo: 1, visual: 'balding middle-aged man in worn red cap, semi-realistic warm cinematic grade', tts: '', caption: '我的道館呢' },
    ]);
    complete.mockResolvedValue('[]');
    await suggestShots('p', { count: 1 });
    const msg = (complete.mock.calls[0][0].messages[0].content as string);
    expect(msg).toContain('balding middle-aged man in worn red cap'); // visual 錨點（角色+畫風）有進脈絡
    expect(msg).toContain('我的道館呢'); // 劇情節拍也保留
  });
});
