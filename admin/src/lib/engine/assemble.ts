// Compositor — ffmpeg assembly (port of build_v5.py). Generic: canvas/fps/zoom all params.
// STILL branch first (Ken-Burns zoompan over a keyframe + voice mux). lip/i2v branches to follow.
import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const FFMPEG = process.env.FFMPEG_BIN ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_BIN ?? "ffprobe";

// High-quality, web-friendly H.264 encode args — shared across every encode site so output quality
// stays uniform. CRF 18 is visually near-transparent for this content (was 20); preset slow trades a
// little CPU for noticeably better compression at the same quality; high profile + yuv420p keep it
// universally playable; +faststart relocates the moov atom to the front so the browser can start
// playback / scrub immediately. Override via STUDIO_X264_CRF / STUDIO_X264_PRESET.
const VIDEO_ARGS: string[] = [
  "-c:v", "libx264",
  "-preset", process.env.STUDIO_X264_PRESET ?? "slow",
  "-crf", process.env.STUDIO_X264_CRF ?? "18",
  "-pix_fmt", "yuv420p",
  "-profile:v", "high", "-level", "4.2",
  "-movflags", "+faststart",
];

const CJK_FONTS = [
  "C:/Windows/Fonts/msjh.ttc", "C:/Windows/Fonts/msyh.ttc",
  "C:/Windows/Fonts/simsun.ttc", "C:/Windows/Fonts/mingliu.ttc",
  "/usr/share/fonts/noto/NotoSansCJK-Regular.ttc",        // Linux / Docker worker (font-noto-cjk)
  "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
];
function findCjkFont(): string | undefined { return CJK_FONTS.find((f) => existsSync(f)); }
// bold CJK for meme captions (big punchy text); fall back to regular CJK
const CJK_BOLD_FONTS = [
  "C:/Windows/Fonts/msjhbd.ttc", "C:/Windows/Fonts/msyhbd.ttc",
  "C:/Windows/Fonts/simhei.ttf", "C:/Windows/Fonts/msjh.ttc",
  "/usr/share/fonts/noto/NotoSansCJK-Bold.ttc",           // Linux / Docker worker (font-noto-cjk)
  "/usr/share/fonts/noto/NotoSansCJK-Regular.ttc",
];
function findBoldCjkFont(): string | undefined { return CJK_BOLD_FONTS.find((f) => existsSync(f)) ?? findCjkFont(); }
// drawtext on Windows: forward slashes + double-backslash drive colon (two parser levels each eat one)
function escDrawtext(p: string): string { return p.replace(/\\/g, "/").replace(/:/g, "\\\\:"); }
// soft-wrap CJK so a subtitle line isn't wider than the frame (exported for unit testing; pure)
export function wrapCjk(text: string, max = 13): string {
  const out: string[] = [];
  let line = "";
  for (const ch of text) {
    line += ch;
    const endPunct = "。！？".includes(ch);
    if (line.length >= max || (endPunct && line.length >= 4)) { out.push(line); line = ""; }
  }
  if (line) out.push(line);
  return out.join("\n");
}

function run(bin: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    let stderr = "";
    p.stderr.on("data", (d) => { stderr += d.toString(); });
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

export function probeDuration(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path], { windowsHide: true });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${err.slice(-300)}`));
      const v = parseFloat(out.trim());
      resolve(Number.isFinite(v) ? v : 0);
    });
  });
}

/** True if the file has at least one audio stream. */
export function probeHasAudio(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(FFPROBE, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path], { windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.on("error", () => resolve(false));
    p.on("close", () => resolve(out.trim().length > 0));
  });
}

/** 字幕圖層樣式（專案級可設）。fontSize 絕對像素、color 名稱或 #RRGGBB、position 決定垂直位置。 */
export interface SubStyle {
  fontSize?: number;
  color?: string;
  position?: 'bottom' | 'center' | 'top';
}

// All caption pixel sizes/offsets below were tuned for a 720×1280 (H=1280) canvas. Scaling them by
// canvasH/1280 keeps the layout proportional at any resolution — exactly 1.0 (no change) at 720p, so
// it's zero-regression, while a 1080×1920 render gets correspondingly larger text/strokes instead of
// tiny captions floating in a big frame.
const REF_H = 1280;
const capScale = (canvasH?: number): number => (canvasH && canvasH > 0 ? canvasH / REF_H : 1);

// Light finishing unsharp for the Ken-Burns still paths only: those supersample 2× then downscale to
// canvas (slightly soft), so a gentle luma unsharp (amount 0.4, chroma 0 → no colour fringing, no
// halos) recovers micro-contrast. NOT applied to i2v/lipsync clips (would amplify their compression
// artifacts). Inserted before captions so text edges aren't over-sharpened. Disable: STUDIO_UNSHARP=off.
const UNSHARP = (process.env.STUDIO_UNSHARP ?? "on").toLowerCase() !== "off" ? ",unsharp=5:5:0.4:5:5:0.0" : "";

// Subtle cinematic colour grade applied to every shot for a filmic look: a touch more contrast and
// saturation, shadows nudged cool + highlights nudged warm (the classic teal-orange film look). Kept
// gentle so it enhances rather than restyles the image. Disable with STUDIO_GRADE=off. Applied after
// any sharpening and before captions, so on-screen text keeps its intended colours. Each clip is graded
// at build time so the whole film (including crossfades) reads uniformly.
// Selectable cinematic colour grades. STUDIO_GRADE=off disables entirely; otherwise STUDIO_GRADE_STYLE
// picks the look (default 'teal' = the original, byte-identical). Each is a gentle eq + colourbalance so
// it enhances rather than restyles, and is a hook the UI can later expose as a per-project "look".
const GRADE_STYLES: Record<string, string> = {
  teal:  "eq=contrast=1.06:saturation=1.08:gamma=0.98,colorbalance=rs=-0.015:bs=0.025:rh=0.03:bh=-0.025",
  warm:  "eq=contrast=1.05:saturation=1.10:gamma=0.99,colorbalance=rs=0.02:gs=0.008:rh=0.05:bh=-0.04",
  cool:  "eq=contrast=1.06:saturation=1.04:gamma=0.98,colorbalance=rs=-0.04:bs=0.05:rh=-0.02:bh=0.04",
  noir:  "eq=contrast=1.18:saturation=0.55:gamma=0.95",
  vivid: "eq=contrast=1.10:saturation=1.22:gamma=0.99",
};
const GRADE = (process.env.STUDIO_GRADE ?? "on").toLowerCase() === "off"
  ? ""
  : `,${GRADE_STYLES[(process.env.STUDIO_GRADE_STYLE ?? "teal").toLowerCase()] ?? GRADE_STYLES.teal}`;

/**
 * 產生字幕 drawtext filter + 寫好的暫存字幕檔（呼叫端負責 unlink 全部）。canvasH 用來等比縮放字級/位置。
 * 每一行各自一個 drawtext 並垂直堆疊，**刻意不在單一 textfile 裡放換行** —— ffmpeg 8.x 的 drawtext
 * 會把 textfile 中的換行算成 .notdef 方塊（□）顯示在每行行尾（已實證）。逐行 drawtext 即可避開。
 */
function subDrawtext(text: string, style: SubStyle | undefined, font: string, canvasH?: number): { filter: string; subFiles: string[] } {
  const lines = wrapCjk(text).split('\n').filter((l) => l.length > 0);
  const s = capScale(canvasH);
  const base = typeof style?.fontSize === 'number' && style.fontSize > 0 ? style.fontSize : 42;
  const fontsize = Math.round(base * s);
  const border = Math.max(2, Math.round(3 * s));
  const ls = Math.round(12 * s);
  const color = (style?.color ?? 'white').replace(/[^#\w@.]/g, '') || 'white'; // 防注入：只留色名/hex 合法字元
  const sh = Math.max(1, Math.round(2 * s)); // 柔和投影位移（等比縮放）：搭配描邊在雜亂背景上更清晰
  const lineH = fontsize + ls;
  const n = Math.max(1, lines.length);
  // 整塊字幕的頂端 y（之後每行往下堆 i*lineH）。bottom 以「最後一行」對齊 h-240 底邊距 → 多行往上長、
  // 底邊距一致（單行 n=1 時 baseTop = h-240，與原本相同＝零回歸；多行不再把首行釘在 h-240 而把整塊往下擠）。
  const baseTop =
    style?.position === 'top'
      ? `${Math.round(180 * s)}`
      : style?.position === 'center'
        ? `(h-${n * lineH})/2`
        : `h-${Math.round(240 * s) + (n - 1) * lineH}`;
  const subFiles: string[] = [];
  const filters = lines.map((ln, i) => {
    const f = join(tmpdir(), `sub_${randomUUID()}.txt`);
    writeFileSync(f, ln, 'utf8');
    subFiles.push(f);
    const y = `${baseTop}+${i * lineH}`;
    return (
      `drawtext=fontfile=${escDrawtext(font)}:textfile=${escDrawtext(f)}:` +
      `fontcolor=${color}:fontsize=${fontsize}:borderw=${border}:bordercolor=black@0.85:` +
      `shadowcolor=black@0.45:shadowx=${sh}:shadowy=${sh}:` +
      // gentle 0.35s alpha fade-in so the narration subtitle glides in rather than popping (commas escaped)
      `x=(w-text_w)/2:y=${y}:alpha='if(lt(t\\,0.35)\\,t/0.35\\,1)'`
    );
  });
  return { filter: filters.join(','), subFiles };
}

/**
 * 迷因大字幕 drawtext。top = 白色 setup（全程顯示）；bottom = 黃色 punchline（給定 punchAt 時於該秒彈出）。
 * 字級/描邊/位置等比縮放至 canvasH（720p 時 = 原值，零回歸）。
 * 每行各自一個 drawtext 並垂直堆疊 —— 同 subDrawtext，避開 ffmpeg 8.x textfile 換行渲染成 □ 方塊的 bug。
 * 回傳 filter ＋ 寫好的逐行暫存檔（呼叫端負責 unlink）。
 */
function memeCaptionFilter(font: string, text: string, kind: "top" | "bottom", canvasH: number, punchAt?: number): { filter: string; files: string[] } {
  const s = capScale(canvasH);
  const border = Math.max(3, Math.round(6 * s)), ls = Math.round(12 * s);
  const lines = wrapCjk(text, 10).split('\n').filter((l) => l.length > 0);
  const isTop = kind === "top";
  const fontsize = Math.round((isTop ? 62 : 66) * s);
  const color = isTop ? "white" : "yellow";
  const lineH = fontsize + ls;
  const enable = !isTop && punchAt != null ? `:enable='gte(t\\,${punchAt.toFixed(2)})'` : "";
  // top 從 y=110 往下堆；bottom 從 y=h-300 往下堆（與原本 line_spacing 版位置等價）。
  const baseTop = isTop ? `${Math.round(110 * s)}` : `h-${Math.round(300 * s)}`;
  const files: string[] = [];
  const filters = lines.map((ln, i) => {
    const fp = join(tmpdir(), `cap_${randomUUID()}.txt`);
    writeFileSync(fp, ln, "utf8");
    files.push(fp);
    return (
      `drawtext=fontfile=${escDrawtext(font)}:textfile=${escDrawtext(fp)}:` +
      `fontcolor=${color}:fontsize=${fontsize}:borderw=${border}:bordercolor=black:` +
      `x=(w-text_w)/2:y=${baseTop}+${i * lineH}${enable}`
    );
  });
  return { filter: filters.join(","), files };
}

export interface StillOpts {
  image: string;
  voice?: string;
  out: string;
  width?: number;
  height?: number;
  fps?: number;
  pad?: number;          // seconds of tail after voice
  zoomRate?: number;
  zoomMax?: number;
  fallbackDur?: number;  // when no voice
  subtitle?: string;     // 旁白字幕（靜態鏡也燒字幕）
  subStyle?: SubStyle;
  fontfile?: string;
  motionSeed?: number;   // 每鏡不同的鏡頭運動方向（避免每個靜態鏡都同方向漂移）
}

export class Compositor {
  /** STILL shot: scale 2× → cinematic push-in + gentle per-shot drift → mux voice. */
  async still(o: StillOpts): Promise<string> {
    const W = o.width ?? 720, H = o.height ?? 1280, fps = o.fps ?? 30, pad = o.pad ?? 0.45;
    const adur = o.voice ? await probeDuration(o.voice) : (o.fallbackDur ?? 4.0);
    const dur = adur + pad;
    const frames = Math.ceil(dur * fps);
    const rate = o.zoomRate ?? 0.0009, zmax = o.zoomMax ?? 1.15;
    // 慢推近 + 沿一個（每鏡不同）方向的線性漂移，比定格的純縮放更有電影感。漂移量取超採樣畫布的小比例，
    // 配合 2× 超採樣的裁切餘裕 → 不會移出畫面。技法同 memeStill 的手持運鏡（此處更柔和）。
    const seed = o.motionSeed ?? 0;
    // Alternate the camera move per shot so the film isn't one repeated zoom: even seeds push in, odd
    // seeds pull back (a reveal easing from tight to near-full-frame). Both stay inside the 2× supersample
    // margin by construction — pull-back ends near 1.0 (little crop room) so its drift is halved, and all
    // drift is ∝on (zero at the wide end), so nothing ever slides off-frame.
    const pullBack = (((seed % 2) + 2) % 2) === 1;
    const zexpr = pullBack
      ? `max(${zmax}-${(zmax - 1.04).toFixed(4)}*on/${frames}\\,1.04)` // reveal: tight → wide
      : `min(zoom+${rate}\\,${zmax})`;                                  // push-in
    const dir = ((seed % 4) + 4) % 4; // 0:右 1:左 2:下 3:上
    const driftPx = Math.round(W * 0.06 * (pullBack ? 0.5 : 1)); // 整段總漂移（超採樣下很細微；pull-back 減半保裁切餘裕）
    const dx = dir === 0 ? `+${driftPx}*on/${frames}` : dir === 1 ? `-${driftPx}*on/${frames}` : "";
    const dy = dir === 2 ? `+${driftPx}*on/${frames}` : dir === 3 ? `-${driftPx}*on/${frames}` : "";
    // comma inside min()/max() must be escaped so it isn't read as a filter separator
    let vf =
      `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,` +
      `crop=${W * 2}:${H * 2},` +
      `zoompan=z='${zexpr}':x='iw/2-(iw/zoom/2)${dx}':y='ih/2-(ih/zoom/2)${dy}':d=${frames}:s=${W}x${H}:fps=${fps},setsar=1${UNSHARP}${GRADE}`;
    let subFiles: string[] = [];
    if (o.subtitle) {
      const font = o.fontfile ?? findCjkFont();
      if (font) { const sd = subDrawtext(o.subtitle, o.subStyle, font, H); subFiles = sd.subFiles; if (sd.filter) vf += `,${sd.filter}`; }
    }

    // Always carry an audio track (voice, or a silent bed when there's none) so every clip is a
    // uniform A/V stream — concat/stitch break if one clip is video-only. (memeStill does the same.)
    const args = ["-y", "-loop", "1", "-i", o.image];
    if (o.voice) args.push("-i", o.voice);
    else args.push("-f", "lavfi", "-t", dur.toFixed(3), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    args.push("-filter_complex", `[0:v]${vf}[v]${o.voice ? `;[1:a]apad=whole_dur=${dur.toFixed(3)}[a]` : ""}`, "-map", "[v]", "-map", o.voice ? "[a]" : "1:a", "-c:a", "aac", "-b:a", "160k");
    args.push(...VIDEO_ARGS, "-t", dur.toFixed(3), o.out);

    const { code, stderr } = await run(FFMPEG, args);
    for (const f of subFiles) { try { unlinkSync(f); } catch { /* ignore */ } }
    if (code !== 0) throw new Error(`ffmpeg failed (${code}): ${stderr.slice(-800)}`);
    return o.out;
  }

  /**
   * Stitch N clips (same WxH/fps) with crossfade video + acrossfade audio.
   * `fades` overrides the fade per seam (seam i = between clip i and i+1); a value <=0 means
   * a HARD CUT (rendered as a minimal 0.02s xfade so one uniform filtergraph still applies) —
   * use 0 at the punchline seam for comedic snap.
   * `transitions` picks the xfade video transition per seam (default 'fade' = crossfade). Use
   * 'fadeblack' at scene changes for a cinematic dip-to-black; audio always uses acrossfade.
   */
  async stitch(o: { clips: string[]; out: string; fade?: number; fades?: number[]; transitions?: string[] }): Promise<string> {
    const { clips } = o;
    if (clips.length === 0) throw new Error("stitch: no clips");
    if (clips.length === 1) {
      const { code, stderr } = await run(FFMPEG, ["-y", "-i", clips[0], "-c", "copy", o.out]);
      if (code !== 0) throw new Error(`ffmpeg copy failed: ${stderr.slice(-400)}`);
      return o.out;
    }
    const rawFade = (seam: number): number => o.fades?.[seam] ?? o.fade ?? 0.25;
    const seams = clips.length - 1;
    // every seam a hard cut → true concat (xfade/acrossfade below ~1 frame collapses the chain)
    let allHard = true;
    for (let s = 0; s < seams; s++) if (rawFade(s) > 0) { allHard = false; break; }
    if (allHard) return this.concat({ clips, out: o.out });

    // mixed/crossfade: clamp every fade to ≥2 frames so xfade never goes sub-frame
    const minFade = 2 / 30;
    const seamFade = (seam: number): number => Math.max(rawFade(seam), minFade);
    const durs = await Promise.all(clips.map((c) => probeDuration(c)));
    const args = ["-y"];
    for (const c of clips) args.push("-i", c);

    const trans = (seam: number): string => o.transitions?.[seam] ?? "fade";
    const fc: string[] = [];
    let vlabel = "0:v", running = durs[0];
    for (let i = 1; i < clips.length; i++) {
      const fade = seamFade(i - 1);
      const offset = running - fade;
      const out = i === clips.length - 1 ? "vout" : `v${i}`;
      fc.push(`[${vlabel}][${i}:v]xfade=transition=${trans(i - 1)}:duration=${fade.toFixed(3)}:offset=${offset.toFixed(3)}[${out}]`);
      vlabel = out;
      running = running + durs[i] - fade;
    }
    let alabel = "0:a";
    for (let i = 1; i < clips.length; i++) {
      const fade = seamFade(i - 1);
      const out = i === clips.length - 1 ? "aout" : `a${i}`;
      fc.push(`[${alabel}][${i}:a]acrossfade=d=${fade.toFixed(3)}[${out}]`);
      alabel = out;
    }
    args.push("-filter_complex", fc.join(";"), "-map", "[vout]", "-map", "[aout]",
      ...VIDEO_ARGS, "-c:a", "aac", "-b:a", "160k", o.out);

    const { code, stderr } = await run(FFMPEG, args);
    if (code !== 0) throw new Error(`ffmpeg stitch failed (${code}): ${stderr.slice(-1000)}`);
    return o.out;
  }

  /** Hard-cut concatenation (exact total = sum of clip durations); audio normalized to 44.1k stereo. */
  async concat(o: { clips: string[]; out: string }): Promise<string> {
    const { clips } = o;
    if (clips.length === 0) throw new Error("concat: no clips");
    if (clips.length === 1) {
      const { code, stderr } = await run(FFMPEG, ["-y", "-i", clips[0], "-c", "copy", o.out]);
      if (code !== 0) throw new Error(`ffmpeg concat copy failed: ${stderr.slice(-400)}`);
      return o.out;
    }
    const args = ["-y"];
    for (const c of clips) args.push("-i", c);
    const pre: string[] = [];
    let cc = "";
    for (let i = 0; i < clips.length; i++) {
      pre.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[ca${i}]`);
      cc += `[${i}:v][ca${i}]`;
    }
    cc += `concat=n=${clips.length}:v=1:a=1[v][a]`;
    args.push("-filter_complex", `${pre.join(";")};${cc}`, "-map", "[v]", "-map", "[a]",
      ...VIDEO_ARGS, "-c:a", "aac", "-b:a", "160k", o.out);
    const { code, stderr } = await run(FFMPEG, args);
    if (code !== 0) throw new Error(`ffmpeg concat failed (${code}): ${stderr.slice(-1000)}`);
    return o.out;
  }

  /**
   * MOTION shot: loop an i2v clip to canvas, burn subtitle, mux voice. Voice is optional — without it
   * (e.g. real-motion B-roll before TTS exists) the clip runs for fallbackDur with a silent audio bed,
   * so it's still a uniform A/V clip the stitcher accepts.
   */
  async motionShot(o: {
    clip: string; voice?: string; out: string; subtitle?: string; subStyle?: SubStyle;
    width?: number; height?: number; pad?: number; fontfile?: string; fallbackDur?: number;
  }): Promise<string> {
    const W = o.width ?? 720, H = o.height ?? 1280, pad = o.pad ?? 0.4;
    const adur = o.voice ? await probeDuration(o.voice) : (o.fallbackDur ?? 4.0);
    const dur = adur + pad;
    let vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1${GRADE}`;
    let subFiles: string[] = [];
    if (o.subtitle) {
      const font = o.fontfile ?? findCjkFont();
      if (font) { const sd = subDrawtext(o.subtitle, o.subStyle, font, H); subFiles = sd.subFiles; if (sd.filter) vf += `,${sd.filter}`; }
    }
    const args = ["-y", "-stream_loop", "-1", "-i", o.clip];
    if (o.voice) args.push("-i", o.voice);
    else args.push("-f", "lavfi", "-t", dur.toFixed(3), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    args.push("-filter_complex", `[0:v]${vf}[v]${o.voice ? `;[1:a]apad=whole_dur=${dur.toFixed(3)}[a]` : ""}`, "-map", "[v]", "-map", o.voice ? "[a]" : "1:a",
      ...VIDEO_ARGS, "-c:a", "aac", "-b:a", "160k",
      "-t", dur.toFixed(3), o.out);
    const { code, stderr } = await run(FFMPEG, args);
    for (const f of subFiles) { try { unlinkSync(f); } catch { /* ignore */ } }
    if (code !== 0) throw new Error(`ffmpeg motionShot failed (${code}): ${stderr.slice(-1000)}`);
    return o.out;
  }

  /**
   * Mix a BGM bed under an existing video's audio. With ducking (default; STUDIO_DUCK!=off) the music
   * sits fuller in silent gaps and automatically dips under narration via sidechain compression keyed by
   * the voice — the single biggest "scored film vs amateur" audio tell. Without ducking it falls back to
   * the old constant-gain mix (set duck:false or STUDIO_DUCK=off). The final stage always loudness-
   * normalizes the mix to ≈ -16 LUFS / -1.5 dBTP (STUDIO_LOUDNORM=off to skip). Output length = video.
   */
  async mixBgm(o: { video: string; bgm: string; out: string; bgmGain?: number; voiceGain?: number; duck?: boolean; duckGain?: number }): Promise<string> {
    const bg = o.bgmGain ?? 0.18, vg = o.voiceGain ?? 1.0;
    const duckOn = o.duck ?? (process.env.STUDIO_DUCK ?? "on").toLowerCase() !== "off";
    // Loudness-normalize the final mix to a social-friendly target (≈ -16 LUFS, true-peak -1.5 dBTP)
    // so every export plays back at a consistent, broadcast-sane volume instead of "too quiet / clipped".
    // This is the last audio stage (final.mp4 always goes through mixBgm). Disable via STUDIO_LOUDNORM=off.
    const normOn = (process.env.STUDIO_LOUDNORM ?? "on").toLowerCase() !== "off";
    const norm = normOn ? `;[mix]loudnorm=I=-16:TP=-1.5:LRA=11[aout]` : `;[mix]anull[aout]`;
    let fc: string;
    if (duckOn) {
      // Music plays fuller in the gaps (duckGain) and is sidechain-compressed by the voice so it dips
      // while narration speaks, then swells back in pauses. Both streams are forced to 44.1k stereo so
      // the sidechain key matches the carrier. Low threshold so even quiet speech ducks; release ~300ms
      // gives a natural recovery rather than a pumping artifact. When there's no real voice (silent bed /
      // SFX-only comedy) the key never crosses threshold → music simply stays at duckGain (desired).
      const dg = o.duckGain ?? Math.min(0.5, Math.max(bg * 1.8, 0.26));
      fc =
        `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${vg},asplit=2[v0][vkey];` +
        `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${dg.toFixed(3)}[m0];` +
        `[m0][vkey]sidechaincompress=threshold=0.05:ratio=6:attack=12:release=300:makeup=1[md];` +
        `[v0][md]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]${norm}`;
    } else {
      fc = `[0:a]volume=${vg}[a0];[1:a]volume=${bg}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]${norm}`;
    }
    const args = ["-y", "-i", o.video, "-i", o.bgm, "-filter_complex", fc,
      "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", o.out];
    const { code, stderr } = await run(FFMPEG, args);
    if (code !== 0) throw new Error(`ffmpeg mixBgm failed (${code}): ${stderr.slice(-800)}`);
    return o.out;
  }

  /**
   * Overlay timed sound-effects onto an existing video's audio (cue list generalizes build_v5's
   * hard-coded shot12/shot13 zaps). atSec = absolute time in the video; gain per cue.
   */
  async mixSfx(o: { video: string; cues: { sfx: string; atSec: number; gain?: number }[]; out: string }): Promise<string> {
    const cues = o.cues ?? [];
    if (cues.length === 0) {
      const { code, stderr } = await run(FFMPEG, ["-y", "-i", o.video, "-c", "copy", o.out]);
      if (code !== 0) throw new Error(`ffmpeg mixSfx copy failed: ${stderr.slice(-400)}`);
      return o.out;
    }
    // base audio: use the video's track if present, else a silent stereo bed of the video's length
    const hasAudio = await probeHasAudio(o.video);
    const args = ["-y", "-i", o.video];
    let cueBaseIdx = 1;
    let baseAudio = "0:a";
    if (!hasAudio) {
      const vdur = await probeDuration(o.video);
      args.push("-f", "lavfi", "-t", vdur.toFixed(3), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
      baseAudio = "1:a";
      cueBaseIdx = 2;
    }
    for (const c of cues) args.push("-i", c.sfx);
    const fc: string[] = [`[${baseAudio}]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.0[a0]`];
    const mixIns: string[] = ["[a0]"];
    cues.forEach((c, i) => {
      const ms = Math.max(0, Math.round(c.atSec * 1000));
      const g = c.gain ?? 0.7;
      fc.push(`[${cueBaseIdx + i}:a]adelay=${ms}|${ms},aformat=sample_rates=44100:channel_layouts=stereo,volume=${g}[s${i}]`);
      mixIns.push(`[s${i}]`);
    });
    fc.push(`${mixIns.join("")}amix=inputs=${mixIns.length}:duration=first:dropout_transition=0:normalize=0[aout]`);
    args.push("-filter_complex", fc.join(";"), "-map", "0:v", "-map", "[aout]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", o.out);
    const { code, stderr } = await run(FFMPEG, args);
    if (code !== 0) throw new Error(`ffmpeg mixSfx failed (${code}): ${stderr.slice(-1000)}`);
    return o.out;
  }

  /**
   * MEME still: keyframe → (punch-in zoom OR slow Ken-Burns) → big bold captions → mux voice.
   * topCaption shows the whole time (setup); bottomCaption pops in at punchAt (the reveal),
   * and with punchZoom the frame snap-zooms at punchAt for a reaction-magnify.
   */
  async memeStill(o: {
    image: string; voice?: string; out: string;
    width?: number; height?: number; fps?: number; pad?: number; fallbackDur?: number;
    topCaption?: string; bottomCaption?: string; punchAt?: number;
    punchZoom?: number; zoomRate?: number; zoomMax?: number; memeFont?: string; motionSeed?: number;
  }): Promise<string> {
    const W = o.width ?? 720, H = o.height ?? 1280, fps = o.fps ?? 30, pad = o.pad ?? 0.45;
    const adur = o.voice ? await probeDuration(o.voice) : (o.fallbackDur ?? 3.5);
    const dur = adur + pad;
    const frames = Math.ceil(dur * fps);

    // zoom expression: punch-in jump-ramp at punchAt, else slow Ken-Burns (commas escaped for the filter parser)
    let zexpr: string;
    // dynamic camera: gentle handheld sway (varies per shot) + push-in, with a snap-zoom at the punch
    const seed = o.motionSeed ?? 0;
    const ax = 14 + (seed % 3) * 5, ay = 10 + (seed % 2) * 6; // sway amplitude (input px)
    const kx = 24 + (seed % 4) * 6, ky = 31 + (seed % 3) * 7; // sway period (frames)
    const swayX = `+${ax}*sin(on/${kx})`, swayY = `+${ay}*sin(on/${ky})`;
    if (o.punchZoom && o.punchAt != null) {
      const pf = Math.max(1, Math.round(o.punchAt * fps)), pz = o.punchZoom;
      // pre-punch slow push-in 1→1.12, then snap toward pz over 5 frames (continuous, no pop-out)
      zexpr = `if(lt(on\\,${pf})\\,1+0.12*on/${pf}\\,min(${pz}\\,1.12+(on-${pf})/5*(${pz}-1.12)))`;
    } else {
      const zmax = o.zoomMax ?? 1.18;
      zexpr = `min(${zmax}\\,1+0.18*on/${frames})`; // continuous push-in (livelier than slow Ken-Burns)
    }
    let vf =
      `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,` +
      `crop=${W * 2}:${H * 2},` +
      `zoompan=z='${zexpr}':x='iw/2-(iw/zoom/2)${swayX}':y='ih/2-(ih/zoom/2)${swayY}':d=${frames}:s=${W}x${H}:fps=${fps},setsar=1${UNSHARP}${GRADE}`;

    const font = o.memeFont ?? findBoldCjkFont();
    const tmpFiles: string[] = [];
    if (font && o.topCaption) {
      const cap = memeCaptionFilter(font, o.topCaption, "top", H);
      tmpFiles.push(...cap.files); vf += `,${cap.filter}`;
    }
    if (font && o.bottomCaption) {
      const cap = memeCaptionFilter(font, o.bottomCaption, "bottom", H, o.punchAt);
      tmpFiles.push(...cap.files); vf += `,${cap.filter}`;
    }

    // always carry an audio track (voice, or a silent bed) so stitch/mixSfx see a uniform A/V clip
    const args = ["-y", "-loop", "1", "-i", o.image];
    if (o.voice) args.push("-i", o.voice);
    else args.push("-f", "lavfi", "-t", dur.toFixed(3), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    args.push("-filter_complex", `[0:v]${vf}[v]${o.voice ? `;[1:a]apad=whole_dur=${dur.toFixed(3)}[a]` : ""}`, "-map", "[v]", "-map", o.voice ? "[a]" : "1:a", "-c:a", "aac", "-b:a", "160k",
      ...VIDEO_ARGS, "-t", dur.toFixed(3), o.out);

    const { code, stderr } = await run(FFMPEG, args);
    for (const f of tmpFiles) { try { unlinkSync(f); } catch { /* ignore */ } }
    if (code !== 0) throw new Error(`ffmpeg memeStill failed (${code}): ${stderr.slice(-1200)}`);
    return o.out;
  }

  /**
   * MEME motion shot: an i2v (moving) clip → scale/crop to canvas → big meme captions
   * (top setup full-time + bottom punchline popping at punchAt) → loop to voice length → mux voice.
   * Motion comes from the i2v clip itself, so no Ken-Burns; this is the "每鏡都會動" path.
   */
  async memeMotionShot(o: {
    clip: string; voice?: string; out: string;
    width?: number; height?: number; pad?: number; fallbackDur?: number;
    topCaption?: string; bottomCaption?: string; punchAt?: number; memeFont?: string;
  }): Promise<string> {
    const W = o.width ?? 720, H = o.height ?? 1280, pad = o.pad ?? 0.4;
    const adur = o.voice ? await probeDuration(o.voice) : (o.fallbackDur ?? 3.5);
    const dur = adur + pad;
    let vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1${GRADE}`;
    const font = o.memeFont ?? findBoldCjkFont();
    const tmpFiles: string[] = [];
    if (font && o.topCaption) {
      const cap = memeCaptionFilter(font, o.topCaption, "top", H);
      tmpFiles.push(...cap.files); vf += `,${cap.filter}`;
    }
    if (font && o.bottomCaption) {
      const cap = memeCaptionFilter(font, o.bottomCaption, "bottom", H, o.punchAt);
      tmpFiles.push(...cap.files); vf += `,${cap.filter}`;
    }
    const args = ["-y", "-stream_loop", "-1", "-i", o.clip];
    if (o.voice) args.push("-i", o.voice);
    else args.push("-f", "lavfi", "-t", dur.toFixed(3), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    args.push("-filter_complex", `[0:v]${vf}[v]${o.voice ? `;[1:a]apad=whole_dur=${dur.toFixed(3)}[a]` : ""}`, "-map", "[v]", "-map", o.voice ? "[a]" : "1:a", "-c:a", "aac", "-b:a", "160k",
      ...VIDEO_ARGS, "-t", dur.toFixed(3), o.out);
    const { code, stderr } = await run(FFMPEG, args);
    for (const f of tmpFiles) { try { unlinkSync(f); } catch { /* ignore */ } }
    if (code !== 0) throw new Error(`ffmpeg memeMotionShot failed (${code}): ${stderr.slice(-1200)}`);
    return o.out;
  }

  /** Freeze the final frame for holdSec (the "wait… what?" beat); audio padded with silence. */
  async freezeFrame(o: { clip: string; holdSec: number; out: string }): Promise<string> {
    const hold = o.holdSec.toFixed(2);
    const args = ["-y", "-i", o.clip, "-filter_complex",
      `[0:v]tpad=stop_mode=clone:stop_duration=${hold}[v];[0:a]apad=pad_dur=${hold}[a]`,
      "-map", "[v]", "-map", "[a]",
      ...VIDEO_ARGS, "-c:a", "aac", "-b:a", "160k", o.out];
    const { code, stderr } = await run(FFMPEG, args);
    if (code !== 0) throw new Error(`ffmpeg freezeFrame failed (${code}): ${stderr.slice(-800)}`);
    return o.out;
  }

  /**
   * Title / end card: big bold text (+ optional subtitle) over either a darkened, blurred still — a
   * cinematic title over the opening keyframe — or solid black, with a fade in/out and a silent audio
   * bed so it stitches uniformly with the rest of the film. Used to wrap a film with an opening title
   * and an end card. Sizes scale with canvas height (capScale).
   */
  async cardClip(o: {
    out: string; width?: number; height?: number; fps?: number; dur?: number;
    bgImage?: string; bigText?: string; smallText?: string; fontfile?: string; audio?: string;
  }): Promise<string> {
    const W = o.width ?? 720, H = o.height ?? 1280, fps = o.fps ?? 30, dur = o.dur ?? 2.6;
    const s = capScale(H);
    const fadeOut = Math.max(0, dur - 0.5);
    const font = o.fontfile ?? findBoldCjkFont();
    const tmpFiles: string[] = [];
    const draws: string[] = [];
    if (font && o.bigText) {
      const f = join(tmpdir(), `card_big_${randomUUID()}.txt`);
      writeFileSync(f, wrapCjk(o.bigText, 12), "utf8"); tmpFiles.push(f);
      draws.push(
        `drawtext=fontfile=${escDrawtext(font)}:textfile=${escDrawtext(f)}:fontcolor=white:` +
        `fontsize=${Math.round(74 * s)}:borderw=${Math.max(2, Math.round(4 * s))}:bordercolor=black@0.6:` +
        `shadowcolor=black@0.5:shadowx=${Math.round(2 * s)}:shadowy=${Math.round(2 * s)}:` +
        `x=(w-text_w)/2:y=h*0.42-text_h/2:line_spacing=${Math.round(12 * s)}`);
    }
    if (font && o.smallText) {
      const f = join(tmpdir(), `card_small_${randomUUID()}.txt`);
      writeFileSync(f, wrapCjk(o.smallText, 20), "utf8"); tmpFiles.push(f);
      draws.push(
        `drawtext=fontfile=${escDrawtext(font)}:textfile=${escDrawtext(f)}:fontcolor=white@0.85:` +
        `fontsize=${Math.round(34 * s)}:borderw=${Math.max(1, Math.round(2 * s))}:bordercolor=black@0.5:` +
        `x=(w-text_w)/2:y=h*0.56-text_h/2:line_spacing=${Math.round(8 * s)}`);
    }
    const fade = `fade=t=in:st=0:d=0.5,fade=t=out:st=${fadeOut.toFixed(2)}:d=0.5`;
    const args = ["-y"];
    let bg: string;
    if (o.bgImage) {
      args.push("-loop", "1", "-t", dur.toFixed(3), "-i", o.bgImage);
      // darken + desaturate + blur the still so the title reads clearly (cinematic title-over-image)
      bg = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
        `eq=brightness=-0.18:saturation=0.55,gblur=sigma=${Math.round(14 * s)},setsar=1`;
    } else {
      args.push("-f", "lavfi", "-t", dur.toFixed(3), "-i", `color=black:s=${W}x${H}:r=${fps}`);
      bg = `[0:v]setsar=1`;
    }
    // optional scored bed: swell the music in/out with the card; else a silent stereo bed
    let amap = "1:a", aFc = "";
    if (o.audio) {
      args.push("-i", o.audio);
      aFc = `;[1:a]afade=t=in:d=0.6,afade=t=out:st=${fadeOut.toFixed(2)}:d=0.6,apad=whole_dur=${dur.toFixed(3)}[a]`;
      amap = "[a]";
    } else {
      args.push("-f", "lavfi", "-t", dur.toFixed(3), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    }
    const vf = [bg, ...draws, fade].join(",") + "[v]" + aFc;
    args.push("-filter_complex", vf, "-map", "[v]", "-map", amap, "-c:a", "aac", "-b:a", "160k",
      ...VIDEO_ARGS, "-r", String(fps), "-t", dur.toFixed(3), o.out);
    const { code, stderr } = await run(FFMPEG, args);
    for (const f of tmpFiles) { try { unlinkSync(f); } catch { /* ignore */ } }
    if (code !== 0) throw new Error(`ffmpeg cardClip failed (${code}): ${stderr.slice(-1000)}`);
    return o.out;
  }
}
