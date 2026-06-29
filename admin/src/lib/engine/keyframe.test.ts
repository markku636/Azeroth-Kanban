import { describe, it, expect } from 'vitest';
import { buildSdxl, buildSdxlHires } from './keyframe';

/* eslint-disable @typescript-eslint/no-explicit-any */
const base = { ckpt: 'model.safetensors', pos: 'a cat', seed: 1, steps: 20, cfg: 7 };

describe('buildSdxl（SDXL 關鍵幀圖）', () => {
  it('正/負向 prompt、尺寸、checkpoint、SaveImage 都放對節點', () => {
    const g = buildSdxl({ ...base, neg: 'blurry', width: 768, height: 1024, prefix: 'kf' } as any);
    expect(g['6'].inputs.text).toBe('a cat');     // positive CLIPTextEncode
    expect(g['7'].inputs.text).toBe('blurry');    // negative CLIPTextEncode
    expect(g['5'].inputs).toMatchObject({ width: 768, height: 1024 });
    expect(g['4'].inputs.ckpt_name).toBe('model.safetensors');
    expect(g['9'].class_type).toBe('SaveImage');
    expect(g['9'].inputs.filename_prefix).toBe('kf');
    expect(g['8'].inputs.samples).toEqual(['3', 0]); // VAEDecode <- KSampler
  });

  it('預設：832×1216 直式、非空預設負向 prompt、ts_kf 前綴', () => {
    const g = buildSdxl({ ...base } as any);
    expect(g['5'].inputs).toMatchObject({ width: 832, height: 1216 });
    expect((g['7'].inputs.text as string).length).toBeGreaterThan(0);
    expect(g['9'].inputs.filename_prefix).toBe('ts_kf');
  });
});

describe('buildSdxlHires（兩段式：先生圖 → 放大 → 低 denoise 精修）', () => {
  it('含 LatentUpscale 節點，精修 denoise 預設 0.45', () => {
    const g = buildSdxlHires({ ...base } as any);
    const types = Object.values(g).map((n: any) => n.class_type);
    expect(types).toContain('LatentUpscale');
    const ksamplers = Object.values(g).filter((n: any) => n.class_type === 'KSampler');
    expect(ksamplers.some((n: any) => n.inputs.denoise === 0.45)).toBe(true);
  });

  it('可覆寫 hiresDenoise', () => {
    const g = buildSdxlHires({ ...base, hiresDenoise: 0.3 } as any);
    const ksamplers = Object.values(g).filter((n: any) => n.class_type === 'KSampler');
    expect(ksamplers.some((n: any) => n.inputs.denoise === 0.3)).toBe(true);
  });
});
