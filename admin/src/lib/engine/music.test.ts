import { describe, it, expect } from 'vitest';
import { makePad, MOOD_KEYS } from './music';

describe('新增 BGM 情緒（epic/chill/playful）', () => {
  it('MOOD_KEYS 含新舊全部', () => {
    for (const k of ['neutral', 'warm', 'somber', 'tense', 'horror', 'epic', 'chill', 'playful']) {
      expect(MOOD_KEYS).toContain(k);
    }
  });
  it('epic/chill/playful 都產出非靜音、時長正確的有效 WAV', () => {
    const sr = 44100, dur = 2;
    for (const mood of ['epic', 'chill', 'playful']) {
      const buf = makePad(dur, { mood, gain: 0.8 });
      expect(buf.toString('ascii', 0, 4), mood).toBe('RIFF');
      expect(buf.length, mood).toBe(44 + Math.floor(dur * sr) * 4);
      let peak = 0;
      for (let o = 44; o + 1 < buf.length; o += 2) peak = Math.max(peak, Math.abs(buf.readInt16LE(o)));
      expect(peak, mood).toBeGreaterThan(500); // 非靜音
    }
  });
});

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
    for (const mood of ['calm', 'tense', 'happy', 'epic', 'horror', 'unknown-mood']) {
      const buf = makePad(1, { mood });
      expect(buf.toString('ascii', 0, 4), mood).toBe('RIFF');
      expect(buf.toString('ascii', 8, 12), mood).toBe('WAVE');
    }
  });

  it('horror mood：可生成、非靜音、時長正確、音量位階與現有 mood 一致', () => {
    const sr = 44100, dur = 2;
    const buf = makePad(dur, { mood: 'horror' });
    // 有效 WAV 標頭
    expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buf.toString('ascii', 8, 12)).toBe('WAVE');
    // 時長正確：44-byte 標頭 + 每 frame 4 bytes（16-bit 立體聲）
    expect(buf.length).toBe(44 + Math.floor(dur * sr) * 4);
    // 非靜音：掃樣本峰值需明顯大於 0
    let peak = 0;
    for (let o = 44; o + 1 < buf.length; o += 2) peak = Math.max(peak, Math.abs(buf.readInt16LE(o)));
    expect(peak).toBeGreaterThan(500);
    // 不蓋過人聲 duck 後的位階：峰值不得超過 neutral 的兩倍（sub-drone / 摩擦泛音只是點綴）
    const nbuf = makePad(dur);
    let neutralPeak = 0;
    for (let o = 44; o + 1 < nbuf.length; o += 2) neutralPeak = Math.max(neutralPeak, Math.abs(nbuf.readInt16LE(o)));
    expect(peak).toBeLessThanOrEqual(neutralPeak * 2);
  });
});
