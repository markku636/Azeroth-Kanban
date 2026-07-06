import { describe, it, expect } from 'vitest';
import { STYLE_PRESETS, DEFAULT_STYLE_HINT, isComedyHint } from './style-presets';

describe('style-presets', () => {
  it('預設風格＝第一個「好笑有趣」，且為喜劇向', () => {
    expect(STYLE_PRESETS[0].label).toBe('好笑有趣');
    expect(DEFAULT_STYLE_HINT).toBe(STYLE_PRESETS[0].hint);
    expect(isComedyHint(DEFAULT_STYLE_HINT)).toBe(true);
  });
  it('好笑有趣 / 迷因吐槽 = 喜劇；溫馨/科普/沿用來源 ≠ 喜劇', () => {
    const hint = (label: string) => STYLE_PRESETS.find((p) => p.label === label)!.hint;
    expect(isComedyHint(hint('迷因吐槽'))).toBe(true);
    expect(isComedyHint(hint('溫馨勵志'))).toBe(false);
    expect(isComedyHint(hint('知識科普'))).toBe(false);
    expect(isComedyHint('')).toBe(false); // 沿用來源＝空 hint
  });
  it('每個 preset 都有 label；非沿用來源都有 hint 內容', () => {
    for (const p of STYLE_PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      if (p.label !== '沿用來源') expect(p.hint.length).toBeGreaterThan(0);
    }
  });
});
