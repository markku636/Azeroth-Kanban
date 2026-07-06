import { describe, it, expect } from 'vitest';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sfxFile, SFX_NAMES } from './sfx';

// 喜劇卡點音效是純 TS 合成（無 ComfyUI/ffmpeg）→ 直接驗證它產出有效 WAV 且會快取。
describe('sfxFile（迷因卡點音效合成）', () => {
  it('每個內建音效都產出有效的 WAV（RIFF/WAVE 標頭 + 音訊資料）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sfx-test-'));
    try {
      for (const name of SFX_NAMES) {
        const p = sfxFile(name, dir);
        const buf = readFileSync(p);
        expect(buf.length, name).toBeGreaterThan(44);
        expect(buf.toString('ascii', 0, 4), name).toBe('RIFF');
        expect(buf.toString('ascii', 8, 12), name).toBe('WAVE');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('快取：同名第二次呼叫回同一路徑、不重生', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sfx-test-'));
    try {
      const p1 = sfxFile('vineboom', dir);
      const len1 = readFileSync(p1).length;
      const p2 = sfxFile('vineboom', dir);
      expect(p2).toBe(p1);
      expect(readFileSync(p2).length).toBe(len1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// 讀取 16-bit mono WAV 的樣本統計（跳過 44 bytes 標頭）。
function wavStats(buf: Buffer): { rms: number; peak: number } {
  const count = (buf.length - 44) / 2;
  let sum = 0, peak = 0;
  for (let i = 0; i < count; i++) {
    const v = buf.readInt16LE(44 + i * 2) / 32768;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v * v;
  }
  return { rms: Math.sqrt(sum / count), peak };
}

// 恐怖音效同樣是純 TS 合成 → 驗證非靜音且 peak 不超過正規化上限 0.97。
describe('恐怖音效（heartbeat/drone/sting/giggle/riser/whisper）', () => {
  const HORROR_NAMES = ['heartbeat', 'drone', 'sting', 'giggle', 'riser', 'whisper'] as const;

  it('每個恐怖音效皆非靜音（RMS > 0.02）且 peak ≤ 0.97', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sfx-test-'));
    try {
      for (const name of HORROR_NAMES) {
        const buf = readFileSync(sfxFile(name, dir));
        const { rms, peak } = wavStats(buf);
        expect(rms, `${name} RMS`).toBeGreaterThan(0.02);
        expect(peak, `${name} peak`).toBeLessThanOrEqual(0.97);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
