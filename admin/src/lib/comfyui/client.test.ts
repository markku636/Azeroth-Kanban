import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ComfyUIClient } from './client';

/* eslint-disable @typescript-eslint/no-explicit-any */
let fetchMock: any;

beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('ComfyUIClient.submit', () => {
  it('POST /prompt 帶 prompt+client_id，回傳 prompt_id', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ prompt_id: 'pid-123' }) });
    const pid = await new ComfyUIClient('comfy.local:8188').submit({ '1': { class_type: 'X', inputs: {} } } as any, 'cid-9');
    expect(pid).toBe('pid-123');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://comfy.local:8188/prompt');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.client_id).toBe('cid-9');
    expect(body.prompt).toEqual({ '1': { class_type: 'X', inputs: {} } });
  });

  it('非 2xx → 丟錯（帶狀態碼）', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'bad graph' });
    await expect(new ComfyUIClient().submit({} as any, 'c')).rejects.toThrow(/\/prompt 400/);
  });
});

describe('ComfyUIClient.objectInfo', () => {
  it('GET /object_info 並快取（第二次不再打網路）', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ KSampler: { input: {} } }) });
    const c = new ComfyUIClient('h:1');
    const oi1 = await c.objectInfo();
    const oi2 = await c.objectInfo();
    expect(oi1).toBe(oi2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://h:1/object_info');
  });

  it('object_info 非 2xx → 丟錯', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(new ComfyUIClient().objectInfo()).rejects.toThrow(/object_info 500/);
  });
});
