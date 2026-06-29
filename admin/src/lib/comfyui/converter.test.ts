import { describe, it, expect } from 'vitest';
import { prune } from './converter';

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
