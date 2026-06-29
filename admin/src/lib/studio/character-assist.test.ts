import { describe, it, expect, vi, beforeEach } from 'vitest';

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('./llm', () => ({ complete }));

import { optimizeCharacterField, ALLOWED_VERTEX_MODELS, DEFAULT_VERTEX_MODEL } from './character-assist';

/* eslint-disable @typescript-eslint/no-explicit-any */
let captured = '';

beforeEach(() => {
  vi.clearAllMocks();
  complete.mockImplementation((o: any) => { captured = o.messages[0].content; return Promise.resolve('out'); });
});

describe('optimizeCharacterField 清理', () => {
  it('去 code fence + 包覆引號', async () => {
    complete.mockResolvedValue('```\n"開朗"\n```');
    expect(await optimizeCharacterField({ field: 'persona', text: 'x' })).toBe('開朗');
  });

  it('去掉模型誤帶的中文欄位標籤', async () => {
    complete.mockResolvedValue('個性：開朗又熱血');
    expect(await optimizeCharacterField({ field: 'persona', text: 'x' })).toBe('開朗又熱血');
  });

  it('去掉模型誤帶的英文欄位標籤', async () => {
    complete.mockResolvedValue('persona: friendly and bold');
    expect(await optimizeCharacterField({ field: 'persona', text: 'x' })).toBe('friendly and bold');
  });
});

describe('optimizeCharacterField 行為', () => {
  it('強制走 vertex provider', async () => {
    await optimizeCharacterField({ field: 'persona', text: 'x' });
    expect(complete).toHaveBeenCalledWith(expect.anything(), 'vertex');
  });

  it('帶入單次模型覆寫', async () => {
    await optimizeCharacterField({ field: 'persona', text: 'x', model: 'gemini-2.5-pro' });
    expect(complete.mock.calls[0][0].model).toBe('gemini-2.5-pro');
  });

  it('潤飾 persona 時不把舊 persona 當脈絡、但帶 appearance', async () => {
    await optimizeCharacterField({ field: 'persona', text: '編輯中的個性', persona: '舊個性', appearance: '紅帽' });
    expect(captured).toContain('編輯中的個性');
    expect(captured).toContain('外觀：紅帽');
    expect(captured).not.toContain('角色個性／背景：舊個性');
  });
});

describe('ALLOWED_VERTEX_MODELS 白名單', () => {
  it('含預設與常用模型', () => {
    expect(ALLOWED_VERTEX_MODELS).toContain(DEFAULT_VERTEX_MODEL);
    expect(ALLOWED_VERTEX_MODELS).toContain('gemini-2.5-pro');
  });
});
