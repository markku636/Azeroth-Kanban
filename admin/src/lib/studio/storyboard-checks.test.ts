import { describe, it, expect } from 'vitest';
import { checkStoryboard, summarizeChecks, CAPTION_MAX, TTS_MAX, type CheckShot } from './storyboard-checks';

const shot = (o: Partial<CheckShot> = {}): CheckShot => ({ visual: 'x', tts: '一句旁白', branch: 'still', ...o });
// 讓每鏡旁白夠長，加總約 3.8s/鏡 → 32 鏡 ≈ 120s（配合字數估算）
const fullShot = (o: Partial<CheckShot> = {}): CheckShot => ({ visual: 'x', tts: '這是一句大約十五個字的旁白內容', branch: 'still', ...o });

describe('checkStoryboard — 片長 vs 目標', () => {
  it('遠低於目標 → warn 提示還差幾鏡', () => {
    const checks = checkStoryboard(Array.from({ length: 8 }, () => shot()), { targetSeconds: 120 });
    const c = checks.find((x) => x.code === 'too-short');
    expect(c?.level).toBe('warn');
    expect(c?.message).toContain('鏡');
  });
  it('接近目標（旁白字數加總 ≈ 目標）→ 不提片長', () => {
    const checks = checkStoryboard(Array.from({ length: 32 }, () => fullShot()), { targetSeconds: 120 });
    expect(checks.some((x) => x.code === 'too-short' || x.code === 'too-long')).toBe(false);
  });
  it('明顯超過目標 → info 建議刪鏡', () => {
    const checks = checkStoryboard(Array.from({ length: 20 }, () => shot()), { targetSeconds: 30 });
    expect(checks.find((x) => x.code === 'too-long')?.level).toBe('info');
  });
  it('沒給 targetSeconds → 不做片長檢查', () => {
    const checks = checkStoryboard(Array.from({ length: 4 }, () => shot()));
    expect(checks.some((x) => x.code === 'too-short' || x.code === 'too-long' || x.code === 'long-target')).toBe(false);
  });
  it('目標偏長（2 分鐘）→ 研究背書的完播率提醒', () => {
    const checks = checkStoryboard(Array.from({ length: 32 }, () => fullShot()), { targetSeconds: 120 });
    expect(checks.find((x) => x.code === 'long-target')?.level).toBe('info');
  });
  it('目標在完播率甜蜜點（30 秒）→ 不提長片提醒', () => {
    const checks = checkStoryboard(Array.from({ length: 8 }, () => shot()), { targetSeconds: 30 });
    expect(checks.some((x) => x.code === 'long-target')).toBe(false);
  });
});

describe('checkStoryboard — 內容品質', () => {
  it('全靜態（≥4 鏡）→ 建議加動態', () => {
    const checks = checkStoryboard(Array.from({ length: 6 }, () => shot({ branch: 'still' })));
    expect(checks.find((x) => x.code === 'all-still')?.level).toBe('info');
  });
  it('有任一 i2v → 不提全靜態', () => {
    const arr = [shot(), shot(), shot(), shot({ branch: 'i2v' })];
    expect(checkStoryboard(arr).some((x) => x.code === 'all-still')).toBe(false);
  });
  it('大字幕超過上限 → warn，指向該鏡', () => {
    const long = '這是一句非常非常長的大字幕會被切掉的';
    expect(long.length).toBeGreaterThan(CAPTION_MAX);
    const checks = checkStoryboard([shot({ caption: long })]);
    const c = checks.find((x) => x.code === 'caption-long');
    expect(c?.level).toBe('warn');
    expect(c?.shotIndex).toBe(0);
  });
  it('反轉下字幕超過上限 → warn', () => {
    const checks = checkStoryboard([shot({ punchline: '這是一句非常非常長的反轉下字幕會爆版' })]);
    expect(checks.some((x) => x.code === 'punchline-long' && x.level === 'warn')).toBe(true);
  });
  it('旁白過長 → info', () => {
    const checks = checkStoryboard([shot({ tts: '字'.repeat(TTS_MAX + 1) })]);
    expect(checks.find((x) => x.code === 'tts-long')?.level).toBe('info');
  });
  it('無旁白也無大字幕 → info（純畫面）', () => {
    const checks = checkStoryboard([shot({ tts: '', caption: '' })]);
    expect(checks.find((x) => x.code === 'silent')?.shotIndex).toBe(0);
  });
  it('乾淨且達標的分鏡（甜蜜點片長）→ 無提示', () => {
    // 目標落在完播率甜蜜點（< LONG_TARGET_SECONDS），且估算片長貼合目標、有動態鏡、無爆版字幕
    // → 這是一支「內容乾淨」的分鏡，不該有任何品質提示（long-target 只在長片目標才提醒）。
    const arr = Array.from({ length: 16 }, (_, i) => fullShot({ branch: i % 3 === 0 ? 'i2v' : 'still' }));
    expect(checkStoryboard(arr, { targetSeconds: 60 })).toHaveLength(0);
  });
  it('空陣列 → 無提示', () => { expect(checkStoryboard([])).toEqual([]); });
  it('警告優先：warn 排在 info 之前（modal 只顯示前幾條）', () => {
    // 全靜態(info) + 大字幕過長(warn) 混在一起 → 第一條應為 warn
    const arr = [shot({ caption: '這是一句非常非常長的大字幕會被切掉的' }), shot(), shot(), shot()];
    const checks = checkStoryboard(arr);
    expect(checks.length).toBeGreaterThanOrEqual(2);
    expect(checks[0].level).toBe('warn');
  });
});

describe('summarizeChecks', () => {
  it('混合 warn/info → 統計摘要', () => {
    const s = summarizeChecks([
      { level: 'warn', code: 'a', message: '' },
      { level: 'info', code: 'b', message: '' },
      { level: 'info', code: 'c', message: '' },
    ]);
    expect(s).toContain('1 個要注意');
    expect(s).toContain('2 個建議');
  });
  it('空清單 → 空字串', () => { expect(summarizeChecks([])).toBe(''); });
});
