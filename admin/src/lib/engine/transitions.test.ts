import { describe, it, expect } from 'vitest';
import { pickTransition } from './transitions';

describe('pickTransition（場景轉場選擇）', () => {
  it('punch 恆為硬切 fade（不受 seed/mood 影響）', () => {
    expect(pickTransition('punch', 0)).toBe('fade');
    expect(pickTransition('punch', 7, 'horror')).toBe('fade');
  });

  it('決定性：同 seed/kind/mood 永遠同結果（可重現）', () => {
    expect(pickTransition('scene', 3)).toBe(pickTransition('scene', 3));
    expect(pickTransition('within', 5)).toBe(pickTransition('within', 5));
  });

  it('scene：一般情緒依 seed 輪替、且都是合法轉場名', () => {
    const picks = Array.from({ length: 12 }, (_, i) => pickTransition('scene', i));
    expect(new Set(picks).size).toBeGreaterThan(1); // 有變化，不是整片同一種
    const legal = ['fadeblack', 'dissolve', 'circleopen', 'radial', 'smoothup', 'fadewhite'];
    for (const t of picks) expect(legal).toContain(t);
  });

  it('within：一般情緒依 seed 輪替，屬於同場景柔順集合', () => {
    const legal = ['fade', 'dissolve', 'smoothleft', 'smoothright'];
    for (let i = 0; i < 8; i++) expect(legal).toContain(pickTransition('within', i));
  });

  it('沉穩情緒（horror/somber/tense）→ scene=fadeblack、within=dissolve', () => {
    for (const m of ['horror', 'somber', 'tense']) {
      expect(pickTransition('scene', 4, m)).toBe('fadeblack');
      expect(pickTransition('within', 4, m)).toBe('dissolve');
    }
  });

  it('seed 為負 / NaN 也安全（取絕對值、退 0）', () => {
    expect(typeof pickTransition('scene', -3)).toBe('string');
    expect(typeof pickTransition('within', Number.NaN)).toBe('string');
  });
});
