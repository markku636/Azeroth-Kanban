import { describe, it, expect } from 'vitest';
import { checkStoryboard, summarizeChecks, CAPTION_MAX, TTS_MAX, HOOK_TTS_MAX, type CheckShot } from './storyboard-checks';

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
  it('畫面描述含中文 → info（SDXL 會渲成亂碼）', () => {
    const checks = checkStoryboard([shot({ visual: '一個中年男子站在道館前面' })]);
    expect(checks.find((x) => x.code === 'cjk-visual')?.shotIndex).toBe(0);
  });
  it('英文畫面描述 → 不報 cjk-visual', () => {
    const checks = checkStoryboard([shot({ visual: 'a middle-aged man at a gym entrance, cinematic' })]);
    expect(checks.some((x) => x.code === 'cjk-visual')).toBe(false);
  });
  it('畫面只有零星一兩個中文字（如專有名詞）→ 不誤報', () => {
    const checks = checkStoryboard([shot({ visual: 'a Pokemon 皮 gym, cinematic lighting' })]);
    expect(checks.some((x) => x.code === 'cjk-visual')).toBe(false);
  });
  it('旁白過長（非第 1 鏡）→ info', () => {
    const checks = checkStoryboard([shot(), shot({ tts: '字'.repeat(TTS_MAX + 1) })]);
    const c = checks.find((x) => x.code === 'tts-long');
    expect(c?.level).toBe('info');
    expect(c?.shotIndex).toBe(1);
  });
  it('開場鉤子太慢：第 1 鏡旁白過長 → warn（slow-hook）', () => {
    const checks = checkStoryboard([shot({ tts: '字'.repeat(HOOK_TTS_MAX + 1) }), shot()]);
    const c = checks.find((x) => x.code === 'slow-hook');
    expect(c?.level).toBe('warn');
    expect(c?.shotIndex).toBe(0);
  });
  it('第 1 鏡旁白很長 → 只報 slow-hook，不重複報 tts-long', () => {
    const checks = checkStoryboard([shot({ tts: '字'.repeat(TTS_MAX + 5) }), shot()]);
    expect(checks.some((x) => x.code === 'slow-hook')).toBe(true);
    expect(checks.some((x) => x.code === 'tts-long' && x.shotIndex === 0)).toBe(false);
  });
  it('第 1 鏡旁白簡短 → 不報 slow-hook', () => {
    const checks = checkStoryboard([shot({ tts: '你絕對想不到' }), shot()]);
    expect(checks.some((x) => x.code === 'slow-hook')).toBe(false);
  });
  it('只有 1 鏡 → 不做鉤子檢查', () => {
    expect(checkStoryboard([shot({ tts: '字'.repeat(HOOK_TTS_MAX + 10) })]).some((x) => x.code === 'slow-hook')).toBe(false);
  });
  it('相鄰鏡旁白重複 → warn（dup-narration）', () => {
    const checks = checkStoryboard([shot({ tts: '我今天超級無敵倒楣' }), shot({ tts: '我今天超級無敵倒楣！' })]);
    const c = checks.find((x) => x.code === 'dup-narration');
    expect(c?.level).toBe('warn');
    expect(c?.shotIndex).toBe(1);
  });
  it('相鄰鏡旁白不同 → 不報重複', () => {
    const checks = checkStoryboard([shot({ tts: '我今天超級倒楣' }), shot({ tts: '結果峰迴路轉' })]);
    expect(checks.some((x) => x.code === 'dup-narration')).toBe(false);
  });
  it('極短的重複（<4 字）不報，避免誤傷「對啊」「真的」這類口語', () => {
    const checks = checkStoryboard([shot({ tts: '對啊' }), shot({ tts: '對啊' })]);
    expect(checks.some((x) => x.code === 'dup-narration')).toBe(false);
  });
  it('中間鏡無旁白也無大字幕 → info silent（純畫面）', () => {
    const checks = checkStoryboard([shot(), shot({ tts: '', caption: '' }), shot()]);
    expect(checks.find((x) => x.code === 'silent')?.shotIndex).toBe(1);
  });
  it('結尾鏡無旁白/字幕 → weak-ending（不重複報 silent）', () => {
    const checks = checkStoryboard([shot(), shot(), shot({ tts: '', caption: '', punchline: undefined })]);
    expect(checks.find((x) => x.code === 'weak-ending')?.shotIndex).toBe(2);
    expect(checks.some((x) => x.code === 'silent' && x.shotIndex === 2)).toBe(false);
  });
  it('結尾鏡有旁白 → 不報 weak-ending', () => {
    const checks = checkStoryboard([shot(), shot({ tts: '收在一句爆點' })]);
    expect(checks.some((x) => x.code === 'weak-ending')).toBe(false);
  });
  it('乾淨且達標的分鏡（甜蜜點片長）→ 無提示', () => {
    // 目標落在完播率甜蜜點（< LONG_TARGET_SECONDS），且估算片長貼合目標、有動態鏡、無爆版字幕
    // → 這是一支「內容乾淨」的分鏡，不該有任何品質提示（long-target 只在長片目標才提醒）。
    // 每鏡旁白皆不同（避免相鄰重複檢查誤判），長度都 ~16 字撐住片長
    const arr = Array.from({ length: 16 }, (_, i) => fullShot({ branch: i % 3 === 0 ? 'i2v' : 'still', tts: `第${i}鏡的旁白內容大約十五個字這樣` }));
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
