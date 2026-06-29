import { describe, it, expect } from 'vitest';
import { buildPrompt, PROFILES } from './profiles';

/* eslint-disable @typescript-eslint/no-explicit-any */
const oi = {
  VHS_VideoCombine: { input: { required: { images: ['IMAGE'], audio: ['AUDIO'], filename_prefix: ['STRING'] } }, output_node: true },
  LoadImage: { input: { required: { image: ['STRING'] } } },
  CLIPTextEncode: { input: { required: { text: ['STRING'] } } },
} as any;

// 一個會 prune 後保留 97(圖)/93(prompt)/118(輸出) 的最小 workflow。
const wf = () => ({
  nodes: [
    { id: 97, type: 'LoadImage', mode: 0, inputs: [], outputs: [{ type: 'IMAGE' }], widgets_values: ['old.png'] },
    { id: 93, type: 'CLIPTextEncode', mode: 0, inputs: [], outputs: [{ type: 'AUDIO' }], widgets_values: ['old prompt'] },
    { id: 118, type: 'VHS_VideoCombine', mode: 0, inputs: [
      { name: 'images', type: 'IMAGE', link: 1 },
      { name: 'audio', type: 'AUDIO', link: 2 },
    ], widgets_values: ['oldprefix'] },
  ],
  links: [[1, 97, 0, 118, 0, 'IMAGE'], [2, 93, 0, 118, 1, 'AUDIO']],
}) as any;

const profile = { id: 't', kind: 'i2v', workflowPath: 'x', nodes: { image: '97', prompt: '93', promptField: 'text', output: '118' }, timeoutMs: 1000 } as any;

describe('buildPrompt（profile 角色覆寫）', () => {
  it('依 profile node-id 把 image/prompt/outputPrefix 覆寫到對的節點欄位', () => {
    const p = buildPrompt(profile, wf(), oi, { image: 'new.png', prompt: '新台詞', outputPrefix: 'shot1' });
    expect(p['97'].inputs.image).toBe('new.png');
    expect(p['93'].inputs.text).toBe('新台詞');
    expect(p['118'].inputs.filename_prefix).toBe('shot1');
  });

  it('未提供的 input 不覆寫（保留原 workflow 值）', () => {
    const p = buildPrompt(profile, wf(), oi, { image: 'new.png' });
    expect(p['97'].inputs.image).toBe('new.png');
    expect(p['93'].inputs.text).toBe('old prompt');
  });

  it('promptField=value 時寫到 value 欄（lipsync profile 用 value）', () => {
    const valProfile = { ...profile, nodes: { ...profile.nodes, promptField: 'value' } };
    const p = buildPrompt(valProfile, wf(), oi, { prompt: 'x' });
    expect(p['93'].inputs.value).toBe('x');
  });
});

describe('PROFILES registry', () => {
  it('內建 profile 帶完整 node-id 合約', () => {
    expect(PROFILES['infinitetalk-single'].nodes).toMatchObject({ image: '133', audio: '209', prompt: '200', output: '131' });
    expect(PROFILES['wan22-i2v-fast'].kind).toBe('i2v');
  });
});
