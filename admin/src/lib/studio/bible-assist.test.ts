import { describe, it, expect, vi, beforeEach } from 'vitest';

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { studioProject: { findUnique: vi.fn() } } }));
vi.mock('./llm', () => ({ complete }));

import { polishBibleField } from './bible-assist';
import { prisma } from '@/lib/prisma';

/* eslint-disable @typescript-eslint/no-explicit-any */
let captured = '';

beforeEach(() => {
  vi.clearAllMocks();
  complete.mockImplementation((o: any) => { captured = o.messages[0].content; return Promise.resolve('out'); });
  vi.mocked(prisma.studioProject.findUnique as any).mockResolvedValue({
    title: 'P', description: null, premise: '舊前提', logline: '舊DB的logline',
    worldSetting: null, styleGuide: null, tone: null, genre: '喜劇', targetAudience: null, bibleNotes: null,
  });
});

describe('polishBibleField', () => {
  it('清掉 AI 輸出的 code fence 與包覆引號', async () => {
    complete.mockResolvedValue('```\n"潤飾後"\n```');
    expect(await polishBibleField('p', 'premise', 'x')).toBe('潤飾後');
  });

  it('prompt 帶入其他已填欄位作脈絡，並把目前文字當改寫目標', async () => {
    await polishBibleField('p', 'premise', '編輯中的前提');
    expect(captured).toContain('喜劇'); // 類型脈絡
    expect(captured).toContain('編輯中的前提'); // 改寫目標
  });

  it('不把「正在編輯的欄位」舊值當脈絡（非破壞、避免 AI 回聲舊值）', async () => {
    await polishBibleField('p', 'logline', '新編輯中的logline');
    expect(captured).toContain('新編輯中的logline'); // 當作目標
    expect(captured).not.toContain('舊DB的logline'); // 不重複塞進脈絡
  });
});
