import { describe, it, expect } from 'vitest';
import {
  SECONDS_PER_SHOT,
  shotsForDuration,
  estimatedSeconds,
  planAdaptationBatches,
  sliceByFraction,
  ADAPT_BATCH_MAX,
} from './pacing';

describe('時長 ↔ 分鏡數換算', () => {
  it('2 分鐘 → ~30 鏡（可產出 2 分鐘片）', () => {
    const n = shotsForDuration(120);
    expect(n).toBeGreaterThanOrEqual(28);
    expect(n).toBeLessThanOrEqual(34);
  });
  it('常見片長對應合理鏡數', () => {
    expect(shotsForDuration(15)).toBe(Math.round(15 / SECONDS_PER_SHOT));
    expect(shotsForDuration(30)).toBe(Math.round(30 / SECONDS_PER_SHOT));
    expect(shotsForDuration(60)).toBe(Math.round(60 / SECONDS_PER_SHOT));
  });
  it('至少 1 鏡（0 秒也不回 0）', () => { expect(shotsForDuration(0)).toBe(1); });
  it('estimatedSeconds 為反運算的近似', () => {
    const n = shotsForDuration(120);
    expect(estimatedSeconds(n)).toBeGreaterThanOrEqual(100);
    expect(estimatedSeconds(n)).toBeLessThanOrEqual(140);
  });
});

describe('planAdaptationBatches（分批計畫）', () => {
  it('鏡數 ≤ batchMax → 單批、涵蓋全段', () => {
    const b = planAdaptationBatches(8);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ shots: 8, startFrac: 0, endFrac: 1, index: 0, total: 1 });
  });
  it('32 鏡 → 4 批各 8 鏡、fraction 連續覆蓋 0→1', () => {
    const b = planAdaptationBatches(32);
    expect(b).toHaveLength(4);
    expect(b.map((x) => x.shots)).toEqual([8, 8, 8, 8]);
    expect(b[0].startFrac).toBe(0);
    expect(b[b.length - 1].endFrac).toBe(1);
    for (let i = 1; i < b.length; i++) expect(b[i].startFrac).toBe(b[i - 1].endFrac); // 無縫接續
  });
  it('鏡數不整除批數時盡量平均（前批多 1）', () => {
    const b = planAdaptationBatches(20); // ceil(20/8)=3 批 → 7,7,6
    expect(b.map((x) => x.shots)).toEqual([7, 7, 6]);
    expect(b.reduce((s, x) => s + x.shots, 0)).toBe(20); // 總數守恆
  });
  it('任意鏡數：批內鏡數總和 == 目標鏡數', () => {
    for (const n of [1, 5, 13, 17, 25, 40]) {
      const total = planAdaptationBatches(n).reduce((s, x) => s + x.shots, 0);
      expect(total).toBe(n);
    }
  });
  it('每批不超過 batchMax', () => {
    for (const x of planAdaptationBatches(40)) expect(x.shots).toBeLessThanOrEqual(ADAPT_BATCH_MAX);
  });
});

describe('sliceByFraction（逐字稿依比例切段、對齊句界）', () => {
  const text = '大家好。今天要來挑戰一件事。我從小就有一個夢想。這個夢想很瘋狂。但我還是想試試看。最後結果讓所有人都嚇到了。';

  it('全段 0→1 回傳整段（trim 後相等）', () => {
    expect(sliceByFraction(text, 0, 1)).toBe(text.trim());
  });
  it('相鄰兩段無縫接續、不重疊、不漏字（切點對齊句界）', () => {
    const a = sliceByFraction(text, 0, 0.5);
    const b = sliceByFraction(text, 0.5, 1);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    // 兩段相接（去除 trim 空白後）應覆蓋全文
    expect((a + b).replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
  });
  it('切點落在句號之後（不切在句中）', () => {
    const b = sliceByFraction(text, 0.5, 1);
    // 後半段應以某個完整句子開頭（不會以句號起頭）
    expect('。！？'.includes(b[0])).toBe(false);
  });
  it('空字串 → 空字串', () => { expect(sliceByFraction('', 0, 1)).toBe(''); });
  it('四等分覆蓋全文（總和守恆）', () => {
    const parts = [
      sliceByFraction(text, 0, 0.25),
      sliceByFraction(text, 0.25, 0.5),
      sliceByFraction(text, 0.5, 0.75),
      sliceByFraction(text, 0.75, 1),
    ];
    expect(parts.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
  });
});
