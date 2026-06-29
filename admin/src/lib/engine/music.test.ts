import { describe, it, expect } from 'vitest';
import { makePad } from './music';

// 未上傳 BGM 時，每支成片都用 makePad 的程序化配樂墊底 → 驗證它產出有效 WAV、時長對應、各 mood 都穩。
describe('makePad（程序化配樂）', () => {
  it('產出有效的 WAV（RIFF/WAVE 標頭 + 資料）', () => {
    const buf = makePad(2);
    expect(buf.length).toBeGreaterThan(44);
    expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
  });

  it('時長越長 → buffer 越大', () => {
    expect(makePad(4).length).toBeGreaterThan(makePad(1).length);
  });

  it('各種 mood（含未知）都仍是有效 WAV（不丟錯）', () => {
    for (const mood of ['calm', 'tense', 'happy', 'epic', 'unknown-mood']) {
      const buf = makePad(1, { mood });
      expect(buf.toString('ascii', 0, 4), mood).toBe('RIFF');
      expect(buf.toString('ascii', 8, 12), mood).toBe('WAVE');
    }
  });
});
