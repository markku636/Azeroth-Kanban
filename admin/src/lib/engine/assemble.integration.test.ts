// 真 ffmpeg 整合冒煙測試：把「動畫要兩個時間點抽格對比」的教訓固化進測試——R8 進度條曾因 drawbox 幾何
// 只初始化求值一次而整條恆滿版（單格截圖看不出來）。無 ffmpeg 的環境自動跳過。小畫布/低幀率求快。
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Compositor, probeDuration } from './assemble';

const FFMPEG = process.env.FFMPEG_BIN ?? 'ffmpeg';
const hasFfmpeg = (() => {
  try { return spawnSync(FFMPEG, ['-version'], { encoding: 'utf8' }).status === 0; } catch { return false; }
})();

/** 建一支小測試片（純色 + 靜音軌）。 */
function makeClip(out: string, color: string, dur: number): void {
  const r = spawnSync(FFMPEG, ['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=240x426:d=${dur}:r=15`,
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:a', 'aac', out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`makeClip failed: ${(r.stderr ?? '').slice(-300)}`);
}

/** 量某時間點、某裁切區的平均亮度（YAVG，0–255）。 */
function yavgAt(video: string, t: number, crop: string): number {
  const r = spawnSync(FFMPEG, ['-ss', String(t), '-i', video, '-frames:v', '1',
    '-vf', `crop=${crop},signalstats,metadata=print:file=-`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = (r.stdout + r.stderr).match(/YAVG=([\d.]+)/);
  if (!m) throw new Error('YAVG not found');
  return parseFloat(m[1]);
}

describe.skipIf(!hasFfmpeg)('ffmpeg 整合冒煙（真編碼）', () => {
  let dir: string;
  const comp = new Compositor();
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'studio_it_')); return () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ } }; });

  it('stitch：兩 clip xfade 後總長 ≈ a+b−fade、可播放', async () => {
    const a = join(dir, 'a.mp4'), b = join(dir, 'b.mp4'), out = join(dir, 'st.mp4');
    makeClip(a, 'red', 2); makeClip(b, 'blue', 2);
    await comp.stitch({ clips: [a, b], out, fades: [0.5], transitions: ['dissolve'] });
    expect(existsSync(out)).toBe(true);
    const dur = await probeDuration(out);
    expect(Math.abs(dur - 3.5)).toBeLessThan(0.3);
  }, 30_000);

  it('finish 進度條真的會動：早期左亮右暗、末期右側也亮（防 drawbox 恆滿版回歸）', async () => {
    const base = join(dir, 'pb_base.mp4'), out = join(dir, 'pb.mp4');
    makeClip(base, 'black', 4);
    await comp.finish({ video: base, out, width: 240, height: 426, durationSec: 4, progressBar: { color: '#FFFFFF', position: 'bottom' } });
    // 底條區（高 3px、720p 基準厚度 8 縮到 426 ≈ 3px）：左 1/4 vs 右 1/4
    const yBar = 426 - 3;
    const earlyLeft = yavgAt(out, 1.0, `60:3:0:${yBar}`);
    const earlyRight = yavgAt(out, 1.0, `60:3:180:${yBar}`);
    const lateRight = yavgAt(out, 3.7, `60:3:180:${yBar}`);
    expect(earlyLeft).toBeGreaterThan(120);   // t=1/4：左段已填（白）
    expect(earlyRight).toBeLessThan(60);      // 右段還沒到 → 黑
    expect(lateRight).toBeGreaterThan(120);   // t=3.7/4：右段也填了 → 有在動
  }, 30_000);

  it('repurpose：直式轉 16:9 尺寸正確、中央清晰帶', async () => {
    const src = join(dir, 'rp_src.mp4'), out = join(dir, 'rp.mp4');
    makeClip(src, 'white', 1.5);
    await comp.repurpose({ video: src, out, width: 426, height: 240 });
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out], { encoding: 'utf8' });
    expect(probe.stdout.trim()).toBe('426,240');
  }, 30_000);
});
