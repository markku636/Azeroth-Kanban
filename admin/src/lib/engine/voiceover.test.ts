import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SealTTSClient, normalizeTtsText } from './voiceover';

describe('normalizeTtsText（送 TTS 前正規化旁白）', () => {
  it('去掉 markdown 標記（星號/反引號/井字），留下文字', () => {
    expect(normalizeTtsText('**超級**強的 `皮卡丘` ##大招')).toBe('超級強的 皮卡丘 大招');
  });
  it('markdown 連結 → 只留文字', () => {
    expect(normalizeTtsText('看這個 [連結](https://x.com/y) 很讚')).toBe('看這個 連結 很讚');
  });
  it('換行 / tab / 多空白 → 單一空白', () => {
    expect(normalizeTtsText('第一句\n\n第二句\t\t第三句   第四句')).toBe('第一句 第二句 第三句 第四句');
  });
  it('保留中文語氣標點（。！？…，）', () => {
    expect(normalizeTtsText('真的假的？太扯了吧！我不敢相信…')).toBe('真的假的？太扯了吧！我不敢相信…');
  });
  it('空字串 / null 安全', () => {
    expect(normalizeTtsText('')).toBe('');
    expect(normalizeTtsText(undefined as unknown as string)).toBe('');
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
let fetchMock: any;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const okResponse = (audio = 'aGVsbG8=') => ({ ok: true, json: async () => ({ audio_base64: audio, duration_sec: 1.5, sample_rate: 24000 }) });

describe('SealTTSClient.synth', () => {
  it('送出 X-API-Key 標頭 + 必填 lora_scale + cosyvoice3 payload', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await new SealTTSClient('http://tts.local', 'secret-key').synth({ speaker: 'sp1', text: '你好', loraScale: 0.7 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://tts.local/v1/tts');
    expect(init.headers['X-API-Key']).toBe('secret-key');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ speaker: 'sp1', text: '你好', lora_scale: 0.7, engine: 'cosyvoice3', response_mode: 'base64', format: 'wav' });
  });

  it('未給 loraScale → 仍一律帶 lora_scale（預設 0，伺服器必填）', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await new SealTTSClient('http://tts.local', 'k').synth({ speaker: 's', text: 't' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toHaveProperty('lora_scale');
    expect(body.lora_scale).toBe(0);
  });

  it('回應 base64 → 解成 WAV Buffer + duration/sampleRate', async () => {
    const audio = Buffer.from('RIFFxxxx').toString('base64');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ audio_base64: audio, duration_sec: 2.2, sample_rate: 16000 }) });
    const r = await new SealTTSClient('http://tts.local', 'k').synth({ speaker: 's', text: 't' });
    expect(r.wav.toString()).toBe('RIFFxxxx');
    expect(r.durationSec).toBe(2.2);
    expect(r.sampleRate).toBe(16000);
  });

  it('instruct（情緒）只在有提供時帶入', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await new SealTTSClient('http://tts.local', 'k').synth({ speaker: 's', text: 't', instruct: '激動' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).instruct).toBe('激動');

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(okResponse());
    await new SealTTSClient('http://tts.local', 'k').synth({ speaker: 's', text: 't' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('instruct');
  });

  it('4xx（認證/錯誤請求）→ 立即丟錯、不重試', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });
    await expect(new SealTTSClient('http://tts.local', 'bad').synth({ speaker: 's', text: 't' })).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
