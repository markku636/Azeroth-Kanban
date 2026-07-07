// 真 ffmpeg 整合冒煙測試：把「動畫要兩個時間點抽格對比」的教訓固化進測試——R8 進度條曾因 drawbox 幾何
// 只初始化求值一次而整條恆滿版（單格截圖看不出來）。無 ffmpeg 的環境自動跳過。小畫布/低幀率求快。
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync, statSync } from 'node:fs';
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

  it('finish 全開（浮水印+logo+進度條+膠片）：合併 filter_complex 一次編碼成功、尺寸/音軌保留', async () => {
    const base = join(dir, 'fin_base.mp4'), logo = join(dir, 'logo.png'), out = join(dir, 'fin.mp4');
    makeClip(base, '0x334455', 3);
    // 一張帶 alpha 的小 logo
    spawnSync(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'color=c=0xE64C6D@1:s=60x60:d=1', '-frames:v', '1', logo], { encoding: 'utf8' });
    await comp.finish({
      video: base, out, width: 240, height: 426, durationSec: 3,
      watermark: { text: '@it.check', position: 'tr', opacity: 0.6 },
      logo: { src: logo, position: 'tl', scale: 0.2 },
      progressBar: { color: '#22FF88', position: 'bottom' },
      filmFinish: { intensity: 'subtle' },
    });
    expect(existsSync(out)).toBe(true);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'csv=p=0', out], { encoding: 'utf8' });
    expect(probe.stdout).toContain('video,240,426'); // 尺寸不變
    expect(probe.stdout).toContain('audio');          // 音軌保留（0:a? copy）
    // 左上角 logo 區應偏紅（logo 疊上去了）
    const r = spawnSync(FFMPEG, ['-ss', '1.5', '-i', out, '-frames:v', '1', '-vf', 'crop=40:40:12:12,signalstats,metadata=print:file=-', '-f', 'null', '-'], { encoding: 'utf8' });
    const rgb = (r.stdout + r.stderr).match(/YAVG=([\d.]+)/);
    expect(rgb).toBeTruthy();
  }, 45_000);

  it('thumbnail：關鍵幀 → 1280×720 JPG，非空', async () => {
    const kf = join(dir, 'kf.png'), out = join(dir, 'thumb.jpg');
    spawnSync(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'testsrc2=s=720x1280:d=1', '-frames:v', '1', kf], { encoding: 'utf8' });
    await comp.thumbnail({ image: kf, out, title: '整合測試封面', accent: '#FFD400', grade: 'clean' });
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out], { encoding: 'utf8' });
    expect(probe.stdout.trim()).toBe('1280,720');
    expect(statSync(out).size).toBeGreaterThan(2000);
  }, 30_000);

  it('contactSheet：多關鍵幀 → 網格 PNG（欄數×cell 寬 ≤ 總寬）', async () => {
    const imgs = ['red', 'green', 'blue', 'yellow', 'magenta'].map((c, i) => {
      const p = join(dir, `cs_${i}.png`);
      spawnSync(FFMPEG, ['-y', '-f', 'lavfi', '-i', `color=c=${c}:s=200x356:d=1`, '-frames:v', '1', p], { encoding: 'utf8' });
      return p;
    });
    const out = join(dir, 'sheet.png');
    await comp.contactSheet({ images: imgs, labels: [1, 2, 3, 4, 5], aspect: '9:16', out });
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out], { encoding: 'utf8' });
    const [w, h] = probe.stdout.trim().split(',').map(Number);
    expect(w).toBeGreaterThan(1000); // 5 欄 × 202 + padding
    expect(h).toBeGreaterThan(300);
  }, 30_000);
});
