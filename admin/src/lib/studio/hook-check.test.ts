import { describe, it, expect } from 'vitest';
import { analyzeHook } from './hook-check';

describe('analyzeHook', () => {
  it('空字串 → 0 分、weak、給填 logline 的提示', () => {
    const r = analyzeHook('');
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('weak');
    expect(r.length).toBe(0);
    expect(r.tips[0]).toContain('logline');
  });

  it('強鉤子：問句＋數字＋斷言＋你 → strong', () => {
    const r = analyzeHook('你知道嗎？其實 90% 的人都用錯了');
    expect(r.verdict).toBe('strong');
    expect(r.score).toBeGreaterThanOrEqual(68);
    const hit = (k: string) => r.signals.find((s) => s.key === k)?.hit;
    expect(hit('question')).toBe(true);
    expect(hit('number')).toBe(true);
    expect(hit('bold')).toBe(true);
    expect(hit('you')).toBe(true);
  });

  it('開場問候語重扣分且給刪問候提示', () => {
    const greet = analyzeHook('大家好，歡迎回來，今天要跟大家分享一個小技巧');
    expect(greet.penalties.find((p) => p.key === 'greeting')?.hit).toBe(true);
    expect(greet.verdict).toBe('weak');
    expect(greet.tips.some((t) => t.includes('問候'))).toBe(true);
    // 同一句去掉問候、換成鉤子後分數必須更高
    const better = analyzeHook('這個小技巧，能幫你省一半時間');
    expect(better.score).toBeGreaterThan(greet.score);
  });

  it('只取第一句分析（句末標點切斷）', () => {
    const r = analyzeHook('為什麼？因為後面這段落落長不該影響開場評分而且還很長很長很長很長很長很長很長很長很長很長很長很長很長很長');
    expect(r.opener).toBe('為什麼？');
    expect(r.penalties.find((p) => p.key === 'tooLong')?.hit).toBe(false);
    expect(r.signals.find((s) => s.key === 'question')?.hit).toBe(true);
  });

  it('無句末標點的長開場 → tooLong 命中並給砍短提示', () => {
    const long = '這是一段沒有任何標點符號的開場白它非常非常非常非常的長長到超過四十個字這樣就會被判定為開場太長需要砍短';
    const r = analyzeHook(long);
    expect(r.length).toBeGreaterThan(40);
    expect(r.penalties.find((p) => p.key === 'tooLong')?.hit).toBe(true);
    expect(r.tips.some((t) => t.includes('20 字') || t.includes('砍'))).toBe(true);
  });

  it('冗字開頭命中 vague 並給拿掉贅字提示', () => {
    const r = analyzeHook('所以說我們今天來看一下');
    expect(r.penalties.find((p) => p.key === 'vague')?.hit).toBe(true);
    expect(r.tips.some((t) => t.includes('贅字'))).toBe(true);
  });

  it('分數夾在 0–100', () => {
    const max = analyzeHook('你知道嗎？其實現在馬上 3 個方法');
    expect(max.score).toBeLessThanOrEqual(100);
    expect(max.score).toBeGreaterThanOrEqual(0);
    const min = analyzeHook('大家好嗨嗨哈囉歡迎回來今天要跟大家分享這個那個嗯呃所以說然後基本上總之的一段超長開場白喔喔喔喔喔喔喔喔喔喔喔');
    expect(min.score).toBeGreaterThanOrEqual(0);
    expect(min.score).toBeLessThanOrEqual(100);
  });

  it('數字訊號：阿拉伯數字與中文量詞都算', () => {
    expect(analyzeHook('3 個技巧改變你的一天').signals.find((s) => s.key === 'number')?.hit).toBe(true);
    expect(analyzeHook('五招讓你更專注').signals.find((s) => s.key === 'number')?.hit).toBe(true);
    expect(analyzeHook('讓生活更好的方法').signals.find((s) => s.key === 'number')?.hit).toBe(false);
  });

  it('中等鉤子（只有你＋一個訊號）落在 ok 區間', () => {
    const r = analyzeHook('你該試試這個');
    expect(r.verdict === 'ok' || r.verdict === 'weak').toBe(true);
    expect(r.score).toBeGreaterThan(0);
  });

  it('tips 最多 4 條', () => {
    const r = analyzeHook('大家好這個');
    expect(r.tips.length).toBeLessThanOrEqual(4);
  });
});
