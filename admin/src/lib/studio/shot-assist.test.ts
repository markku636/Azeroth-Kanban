import { describe, it, expect, vi, beforeEach } from 'vitest';

// 測 polishShotField 對 AI 輸出的清理（cleanPolish）：常見的 code fence / 包覆引號要被去掉。
const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('./llm', () => ({ complete }));
vi.mock('./story-context', () => ({ buildStoryContext: vi.fn() }));

import { polishShotField } from './shot-assist';
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
