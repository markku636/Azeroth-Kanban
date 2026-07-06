import { describe, it, expect, vi, beforeEach } from 'vitest';

// 整合測試：驗證「抄 YouTube → 2 分鐘分鏡」的各環節串起來能正確協作
// （分批改編 → 正規化落庫 → 即時健檢 → 估時長）。各單元測試各管一段，這裡驗組合面。
vi.mock('./llm', () => ({ complete: vi.fn() }));

import { adaptStoryboardFromSource, coercePlannedShots } from './interview';
import { checkStoryboard } from './storyboard-checks';
import { estimateStoryboardSeconds } from './pacing';
import { complete } from './llm';

/* eslint-disable @typescript-eslint/no-explicit-any */

// 模擬一批「像樣的」改編分鏡：每鏡有獨特、~15 字的旁白（不觸發相鄰重複、加總撐得起 2 分鐘），
// 第 1 鏡是短鉤子（不觸發 slow-hook）。
function batchJson(n: number, tag: string): string {
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => ({
      visual: `a middle-aged man in a red cap, scene ${tag}${i}, cinematic`,
      tts: i === 0 && tag === 'b1' ? '你絕對想不到結局' : `${tag}第${i}鏡這句旁白大約十五個字左右`,
      motion: 'slow push in',
      emotion: '厭世吐槽',
      branch: i % 4 === 0 ? 'i2v' : 'still',
    })),
  );
}

describe('抄 YouTube 全流程整合（~2 分鐘）', () => {
  beforeEach(() => vi.mocked(complete as any).mockReset());

  const transcript = '大家好，今天要來挑戰一件很瘋狂的事。'.repeat(40); // 夠長，會被分批

  it('32 鏡：分批改編 → 正規化 → 健檢，全流程產出一支可用的 2 分鐘分鏡', async () => {
    let call = 0;
    // 32 鏡 = ceil(32/8)=4 批，各 8 鏡
    vi.mocked(complete as any).mockImplementation(async () => batchJson(8, `b${++call}`));

    const shots = await adaptStoryboardFromSource(transcript, 32);
    expect(complete).toHaveBeenCalledTimes(4);
    expect(shots).toHaveLength(32);

    // 正規化落庫（前端審核後的路徑）不該丟任何鏡（每鏡都有 visual+tts）
    const persisted = coercePlannedShots(shots as unknown[]);
    expect(persisted).toHaveLength(32);

    // 有動態鏡（不會觸發 all-still）、旁白多為短句
    expect(persisted.some((s) => s.branch === 'i2v')).toBe(true);

    // 估時長落在 2 分鐘量級，且對目標 120s 的健檢不會叫「太短」
    const est = estimateStoryboardSeconds(persisted);
    expect(est).toBeGreaterThan(60);
    const checks = checkStoryboard(persisted, { targetSeconds: 120 });
    expect(checks.some((c) => c.code === 'too-short')).toBe(false);
    // 第 1 鏡是短鉤子 → 不該報 slow-hook
    expect(checks.some((c) => c.code === 'slow-hook')).toBe(false);
  });

  it('長片其中一批被截斷 → 救回該批完整的鏡，全片仍幾乎完整、不整批消失', async () => {
    let call = 0;
    vi.mocked(complete as any).mockImplementation(async () => {
      call++;
      if (call === 2) return batchJson(8, 'b2').slice(0, 180); // 第 2 批 JSON 中途被切斷
      return batchJson(8, `b${call}`);
    });
    const shots = await adaptStoryboardFromSource(transcript, 32);
    // 被截斷的批救回部分（>0），其餘批完整 → 總數明顯多於 24（=遺失整批 8 鏡的情況）
    expect(shots.length).toBeGreaterThan(24);
    expect(shots.length).toBeLessThanOrEqual(32);
  });

  it('健檢會抓到內容瑕疵（開場鉤子太慢＋相鄰重複）供使用者在審核時修正', async () => {
    const flawed = [
      { visual: 'v0', tts: '這是一個非常非常冗長而且拖泥帶水的開場白遲遲進不了重點', branch: 'still' },
      { visual: 'v1', tts: '重複的一句', branch: 'still' },
      { visual: 'v2', tts: '重複的一句', branch: 'still' },
      { visual: 'v3', tts: '收尾', branch: 'still' },
    ];
    const checks = checkStoryboard(coercePlannedShots(flawed as unknown[]));
    expect(checks.some((c) => c.code === 'slow-hook')).toBe(true);
    expect(checks.some((c) => c.code === 'dup-narration')).toBe(true);
    // 警告優先：第一條是 warn
    expect(checks[0].level).toBe('warn');
  });
});
