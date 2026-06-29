import { describe, it, expect } from 'vitest';
import { prune, convert } from './converter';

/* eslint-disable @typescript-eslint/no-explicit-any */
// prune 從輸出節點往回 BFS，只留可達節點（送 ComfyUI 前去掉沒接到輸出的孤兒，省算力/避免錯誤）。
describe('prune', () => {
  it('保留從輸出節點可達者、移除孤兒節點', () => {
    const prompt = {
      '1': { class_type: 'SaveImage', inputs: { images: ['2', 0] } },
      '2': { class_type: 'VAEDecode', inputs: { samples: ['3', 0] } },
      '3': { class_type: 'KSampler', inputs: { seed: 42 } },
      '99': { class_type: 'OrphanNode', inputs: {} },
    };
    const out = prune(prompt as any, { SaveImage: { output_node: true } } as any);
    expect(Object.keys(out).sort()).toEqual(['1', '2', '3']);
    expect(out['99']).toBeUndefined();
  });

  it('oi 沒有 output_node 標記時，退回已知輸出類別（VHS_VideoCombine 等）', () => {
    const prompt = {
      a: { class_type: 'VHS_VideoCombine', inputs: { images: ['b', 0] } },
      b: { class_type: 'KSampler', inputs: {} },
      c: { class_type: 'Orphan', inputs: {} },
    };
    const out = prune(prompt as any, {} as any);
    expect(Object.keys(out).sort()).toEqual(['a', 'b']);
  });

  it('空 prompt → 空', () => {
    expect(prune({} as any, {} as any)).toEqual({});
  });

  it('共用的上游節點只保留一次、且被保留', () => {
    const prompt = {
      out1: { class_type: 'SaveImage', inputs: { images: ['shared', 0] } },
      shared: { class_type: 'VAEDecode', inputs: { samples: ['ks', 0] } },
      ks: { class_type: 'KSampler', inputs: {} },
    };
    const out = prune(prompt as any, { SaveImage: { output_node: true } } as any);
    expect(Object.keys(out).sort()).toEqual(['ks', 'out1', 'shared']);
  });
});

describe('convert', () => {
  it('widget 值依序對應到 input 名稱；seed 的 control_after_generate 會多吃一個值', () => {
    const oi = { KSampler: { input: { required: { seed: ['INT'], steps: ['INT'], cfg: ['FLOAT'] } } } } as any;
    const wf = { nodes: [{ id: 1, type: 'KSampler', mode: 0, inputs: [], outputs: [], widgets_values: [42, 'randomize', 20, 7.5] }], links: [] } as any;
    const p = convert(wf, oi);
    expect(p['1']).toEqual({ class_type: 'KSampler', inputs: { seed: 42, steps: 20, cfg: 7.5 } });
  });

  it('連線輸入 → [來源節點id, slot] 參照', () => {
    const oi = { VAEDecode: { input: { required: { samples: ['LATENT'] } } }, KSampler: { input: { required: {} } } } as any;
    const wf = {
      nodes: [
        { id: 1, type: 'VAEDecode', mode: 0, inputs: [{ name: 'samples', type: 'LATENT', link: 5 }], widgets_values: [] },
        { id: 2, type: 'KSampler', mode: 0, inputs: [], outputs: [{ type: 'LATENT' }], widgets_values: [] },
      ],
      links: [[5, 2, 0, 1, 0, 'LATENT']],
    } as any;
    expect(convert(wf, oi)['1'].inputs.samples).toEqual(['2', 0]);
  });

  it('mute(mode 2) 的節點被略過', () => {
    const oi = { KSampler: { input: { required: {} } } } as any;
    const wf = { nodes: [{ id: 1, type: 'KSampler', mode: 2, inputs: [], widgets_values: [] }], links: [] } as any;
    expect(convert(wf, oi)['1']).toBeUndefined();
  });

  it('SKIP_TYPES(Note 等) 與 oi 未定義的類型被略過', () => {
    const oi = { KSampler: { input: { required: {} } } } as any;
    const wf = { nodes: [
      { id: 1, type: 'Note', mode: 0, inputs: [], widgets_values: ['備註'] },
      { id: 2, type: 'UnknownNode', mode: 0, inputs: [], widgets_values: [] },
      { id: 3, type: 'KSampler', mode: 0, inputs: [], widgets_values: [] },
    ], links: [] } as any;
    const p = convert(wf, oi);
    expect(p['1']).toBeUndefined();
    expect(p['2']).toBeUndefined();
    expect(p['3']).toBeDefined();
  });
});
