import { describe, it, expect } from 'vitest';
import { lintRetention, type LintShot } from './retention-lint';

const shot = (shotNo: number, text: string, seconds: number): LintShot => ({ shotNo, text, seconds });

describe('lintRetention', () => {
  it('空分鏡：無 issue、shotCount 0', () => {
    const r = lintRetention([]);
    expect(r.shotCount).toBe(0);
    expect(r.issues).toHaveLength(0);
    expect(r.totalSeconds).toBe(0);
  });

  it('健康的短影音：強鉤子＋每鏡短 → 無 issue', () => {
    const shots = [
      shot(1, '你知道嗎？其實 90% 的人都用錯了', 3.5),
      shot(2, '第一個原因很簡單', 3),
      shot(3, '而這會直接影響結果', 3),
      shot(4, '現在就示範給你看', 3.2),
    ];
    const r = lintRetention(shots);
    expect(r.hook.verdict).toBe('strong');
    expect(r.issues).toHaveLength(0);
    expect(r.avgSeconds).toBeLessThan(6.5);
  });

  it('弱開場鉤子 → warn 綁在第一鏡並帶建議', () => {
    const r = lintRetention([shot(1, '我們來聊聊人工智慧', 3), shot(2, '它很有趣', 3), shot(3, '對吧', 2)]);
    const hookIssue = r.issues.find((i) => i.title.includes('鉤子'));
    expect(hookIssue).toBeTruthy();
    expect(hookIssue?.severity).toBe('warn');
    expect(hookIssue?.shotNo).toBe(1);
    expect(hookIssue?.tip.length).toBeGreaterThan(0);
  });

  it('開場鏡太長 → warn，且不與「個別過長鏡」重複計第一鏡', () => {
    const r = lintRetention([shot(1, '你知道嗎？這其實很關鍵', 10), shot(2, '接著看', 3)]);
    const opener = r.issues.filter((i) => i.title === '開場鏡太長');
    expect(opener).toHaveLength(1);
    // 第一鏡不應同時出現在「第 1 鏡偏長」
    expect(r.issues.some((i) => i.title.includes('第 1 鏡偏長'))).toBe(false);
    expect(r.longShots).not.toContain(1);
  });

  it('中段過長鏡 → 逐一 warn，超過 3 個折疊成 info', () => {
    const shots = [
      shot(1, '你知道嗎？90% 的人都錯了', 3),
      shot(2, '長鏡', 9), shot(3, '長鏡', 9), shot(4, '長鏡', 9), shot(5, '長鏡', 9), shot(6, '長鏡', 10),
    ];
    const r = lintRetention(shots);
    expect(r.longShots).toEqual([2, 3, 4, 5, 6]);
    const perShot = r.issues.filter((i) => /第 \d+ 鏡偏長/.test(i.title));
    expect(perShot).toHaveLength(3); // 只逐一列前 3 個
    const overflow = r.issues.find((i) => i.title.includes('另有'));
    expect(overflow?.title).toContain('2 個過長鏡');
  });

  it('整體節奏偏慢 → info（平均每鏡超過門檻）', () => {
    const shots = [shot(1, '你知道嗎？其實答案很意外', 5), shot(2, 'a', 8), shot(3, 'b', 8)];
    const r = lintRetention(shots);
    expect(r.avgSeconds).toBeGreaterThan(6.5);
    expect(r.issues.some((i) => i.title.includes('整體節奏偏慢'))).toBe(true);
  });

  it('少於 3 鏡不觸發「節奏偏慢」（樣本太小）', () => {
    const r = lintRetention([shot(1, '你知道嗎？超意外', 8), shot(2, 'x', 8)]);
    expect(r.issues.some((i) => i.title.includes('整體節奏偏慢'))).toBe(false);
  });

  it('totalSeconds / avgSeconds 正確計算', () => {
    const r = lintRetention([shot(1, '你知道嗎？90% 都錯', 3), shot(2, 'x', 5), shot(3, 'y', 4)]);
    expect(r.totalSeconds).toBeCloseTo(12, 5);
    expect(r.avgSeconds).toBeCloseTo(4, 5);
  });
});
