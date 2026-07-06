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
// serif CJK for atmospheric captions（fontKind='serif'：明/宋體的文藝、驚悚感）; fall back to regular CJK
const CJK_SERIF_FONTS = [
  "C:/Windows/Fonts/mingliu.ttc", "C:/Windows/Fonts/simsun.ttc",
  "C:/Windows/Fonts/kaiu.ttf",
  "/usr/share/fonts/noto/NotoSerifCJK-Regular.ttc",       // Linux / Docker worker (font-noto-cjk)
  "/usr/share/fonts/noto-cjk/NotoSerifCJK-Regular.ttc",
];
function findSerifCjkFont(): string | undefined { return CJK_SERIF_FONTS.find((f) => existsSync(f)) ?? findCjkFont(); }
// drawtext on Windows: forward slashes + double-backslash drive colon (two parser levels each eat one)
// 把路徑塞進 ffmpeg drawtext 前的轉義（Windows 字型/字幕檔路徑的 \ 與 : 是 filter 特殊字元）。exported for testing; pure。
export function escDrawtext(p: string): string { return p.replace(/\\/g, "/").replace(/:/g, "\\\\:"); }
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

// Approximate horizontal advance (px) of one glyph at a given fontsize, used to lay out per-character
// karaoke highlighting so the highlight glyph sits exactly on its base glyph. CJK/kana/fullwidth punct
// are square full-width (≈1em); ASCII/Latin/halfwidth are ≈0.5em; a space is a thin gap. This mirrors
// how a CJK font advances (no kerning), so a line's total = Σ advances matches ffmpeg's text_w closely.
// Exported for unit testing; pure.
export function charAdvance(ch: string, fontsize: number): number {
  if (ch === " ") return fontsize * 0.32;
  const code = ch.codePointAt(0) ?? 0;
  // halfwidth: everything up to CJK radicals (Latin/Greek/Cyrillic/punct) + halfwidth kana/hangul blocks
  const halfWidth =
    code <= 0x2e7f || (code >= 0xff61 && code <= 0xffdc) || (code >= 0xffe8 && code <= 0xffee);
  return halfWidth ? fontsize * 0.5 : fontsize;
}

// Split a narration line into short "pop-on" caption segments (highest short-form retention). Breaks at
// sentence/clause punctuation first, then chunks any long run to <=maxLen; sub-minLen fragments are merged
// forward so no caption flashes too briefly to read. Soft clause punctuation (，、；：) is trimmed from
// segment ends for clean chunks; terminal 。！？…!? are kept for reading rhythm. Exported for unit testing; pure.
export function segmentCaption(text: string, maxLen = 9, minLen = 3): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const rawParts = clean.split(/(?<=[。！？…，、；：!?,;:])/).map((p) => p.trim()).filter(Boolean);
  const pieces: string[] = [];
  for (const part of rawParts) {
    const unit = part.replace(/[，、；：,;:]\s*$/, "") || part;
    if (unit.length <= maxLen) { pieces.push(unit); continue; }
    let buf = "";
    for (const ch of unit) { buf += ch; if (buf.length >= maxLen) { pieces.push(buf); buf = ""; } }
    if (buf) pieces.push(buf);
  }
  const segs: string[] = [];
  for (const p of pieces) {
    if (segs.length && p.length < minLen) segs[segs.length - 1] += p;
    else segs.push(p);
  }
  return segs.length ? segs : [clean];
}

// Distribute pop-on caption segments across the narration timeline, proportional to each segment's
// character count (≈ speech time). The last segment holds through the tail pad (end = totalDur + 1) so
// text doesn't vanish during the trailing pause. Exported for unit testing; pure.
export function captionSegmentTimings(
  segs: string[], narrationDur: number, totalDur: number,
): { seg: string; start: number; end: number }[] {
  const totalChars = segs.reduce((a, b) => a + b.length, 0) || 1;
  const out: { seg: string; start: number; end: number }[] = [];
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const start = (acc / totalChars) * narrationDur;
    acc += segs[i].length;
    const end = i === segs.length - 1 ? totalDur + 1 : (acc / totalChars) * narrationDur;
    out.push({ seg: segs[i], start, end });
  }
  return out;
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

/**
 * Trim leading & trailing silence from a voice clip (keeps internal pauses) so cuts feel tight, the
 * hook lands faster, and pop-on captions sync to actual speech. Conservative −45 dB peak threshold so
 * it strips true digital silence without clipping soft speech onsets/breaths (verified: first-150ms
 * loudness rises or holds, never drops). Writes outPath; returns the trimmed duration, or 0 on failure.
 */
export async function trimSilence(inPath: string, outPath: string): Promise<number> {
  const af =
    "silenceremove=start_periods=1:start_threshold=-45dB:start_duration=0.02:detection=peak," +
    "areverse," +
    "silenceremove=start_periods=1:start_threshold=-45dB:start_duration=0.02:detection=peak," +
    "areverse";
  const { code } = await run(FFMPEG, ["-y", "-i", inPath, "-af", af, outPath]);
  if (code !== 0) return 0;
  try { return await probeDuration(outPath); } catch { return 0; }
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

/** 字幕圖層樣式（專案級可設）。fontSize 絕對像素、color 名稱或 #RRGGBB、position 決定垂直位置。
 * segment=true → pop-on 動態字幕：把整段旁白切成短句、依語音長度逐句彈出（短影音保留率最高的字幕形式）。 */
export interface SubStyle {
  fontSize?: number;
  color?: string;
  position?: 'bottom' | 'center' | 'top';
  segment?: boolean;
  /** plate=true → 字幕後加半透明底板（box），雜亂/高亮背景上更好讀。預設關＝零回歸。 */
  plate?: boolean;
  /** 字體種類：'serif'=襯線明/宋體（文藝/驚悚氛圍）；預設 'bold'=粗黑體（零回歸）。o.fontfile 仍優先。 */
  fontKind?: 'bold' | 'serif';
  /** highlight=true → 卡拉OK逐字高亮：在 pop-on 逐句字幕上，字隨語音進度由 color 逐字「填成」highlightColor
   *  （短影音/Reels 最吸睛的字幕形式）。只在 segment=true 時生效；預設關＝零回歸。 */
  highlight?: boolean;
  /** 卡拉OK高亮色（字名或 #RRGGBB）；預設亮金 #FFD400（在畫面上最跳）。 */
  highlightColor?: string;
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
  // 驚悚 look：壓暗提對比、抽飽和、陰影偏青＋高光微暖、vignette 暗角、細顆粒 noise（恐怖片質感）
  horror: "eq=contrast=1.22:saturation=0.42:gamma=0.90:brightness=-0.05,colorbalance=rs=-0.06:gs=-0.02:bs=0.07:rh=-0.02:bh=0.04,vignette=PI/4.5,noise=alls=7:allf=t+u",
  // clean：明亮乾淨、微提亮與對比 —— 教學/解說最百搭（不偏色）
  clean: "eq=contrast=1.10:saturation=1.06:gamma=1.04:brightness=0.02",
  // film：溫暖復古霧面（略降對比、抬陰影、偏暖、微抽飽和）
  film:  "eq=contrast=0.95:saturation=0.90:gamma=1.02:brightness=0.015,colorbalance=rs=0.06:gs=0.02:bs=-0.06:rh=0.04:bh=-0.05",
  // mono：黑白高反差（去色＋提對比），莊重/報導感
  mono:  "eq=contrast=1.16:saturation=0:gamma=0.98",
  // dreamy：柔和粉嫩（低對比、提亮、微暖、略抽飽和），抒情/vlog
  dreamy: "eq=contrast=0.92:saturation=0.96:gamma=1.06:brightness=0.03,colorbalance=rh=0.05:bh=0.03",
  // cyber：青陰影×洋紅高光的高飽和霓虹感（科技/夜景）
  cyber: "eq=contrast=1.16:saturation=1.14:gamma=0.97,colorbalance=rs=-0.08:gs=-0.03:bs=0.10:rh=0.08:gh=-0.04:bh=0.06",
};
/** 可選的調色 look（GRADE_STYLES 的 key）；供 UI 列選項與 per-project look 驗證。順序＝UI 呈現順序。 */
export const GRADE_STYLE_KEYS = Object.keys(GRADE_STYLES);
// 取得調色 filter 鏈（含前導逗號，直接接在 setsar=1 之後、drawtext 之前）。style 未傳時與重構前的
// GRADE 常數逐字元相同：STUDIO_GRADE=off → 空字串；否則 STUDIO_GRADE_STYLE 選 look、查無 → teal。
// 各鏡可用 opts.grade 逐鏡覆寫。exported for unit testing; pure（僅讀 env）。
export function gradeChain(style?: string): string {
  if ((process.env.STUDIO_GRADE ?? "on").toLowerCase() === "off") return "";
  return `,${GRADE_STYLES[(style ?? process.env.STUDIO_GRADE_STYLE ?? "teal").toLowerCase()] ?? GRADE_STYLES.teal}`;
}

/**
 * 產生字幕 drawtext filter + 寫好的暫存字幕檔（呼叫端負責 unlink 全部）。canvasH 用來等比縮放字級/位置。
 * 每一行各自一個 drawtext 並垂直堆疊，**刻意不在單一 textfile 裡放換行** —— ffmpeg 8.x 的 drawtext
 * 會把 textfile 中的換行算成 .notdef 方塊（□）顯示在每行行尾（已實證）。逐行 drawtext 即可避開。
 */
// exported for unit testing (asserts the drawtext filter contract: plate box / pop-on enable windows /
// kinetic slide). Writes per-line temp files as a side effect — callers/tests unlink the returned subFiles.
export function subDrawtext(
  text: string,
  style: SubStyle | undefined,
  font: string,
  canvasH?: number,
  timing?: { narrationDur: number; totalDur: number },
  canvasW?: number,
): { filter: string; subFiles: string[] } {
  const s = capScale(canvasH);
  const base = typeof style?.fontSize === 'number' && style.fontSize > 0 ? style.fontSize : 42;
  const fontsize = Math.round(base * s);
  // 依字級與畫布寬度動態算每行上限，避免大字級（如「迷因大黃」64px）在 1080p 上一行 13 字超出畫面。
  // 上限取「原本固定值」與「畫面放得下的字數」的較小者 → 小字級維持原行為（零回歸），大字級才收窄。
  const w = canvasW && canvasW > 0 ? canvasW : (canvasH && canvasH > 0 ? Math.round((canvasH * 9) / 16) : 720);
  const fitChars = Math.max(6, Math.floor((w * 0.9) / Math.max(1, fontsize)));
  const wrapMax = Math.min(13, fitChars);   // 整段字幕（原預設 13）
  const segWrapMax = Math.min(11, fitChars); // pop-on 逐句（原預設 11）
  const border = Math.max(2, Math.round(3 * s));
  const ls = Math.round(12 * s);
  const color = (style?.color ?? 'white').replace(/[^#\w@.]/g, '') || 'white'; // 防注入：只留色名/hex 合法字元
  const sh = Math.max(1, Math.round(2 * s)); // 柔和投影位移（等比縮放）：搭配描邊在雜亂背景上更清晰
  // 可選半透明底板：雜亂/高亮背景上大幅提升可讀性。box 用文字外框寬度當內距（boxborderw）。預設關＝零回歸。
  const plate = style?.plate ? `box=1:boxcolor=black@0.5:boxborderw=${Math.max(8, Math.round(16 * s))}:` : '';
  const lineH = fontsize + ls;
  const subFiles: string[] = [];

  // 把一組（已 wrap 的）行畫在 bottom/center/top 錨點；enable=顯示時間窗（空=全程）、fadeExpr=alpha 表達式。
  // yAnim=可選的 y 動畫項（pop-on 用來做「滑入」kinetic 進場）；空字串時 y 維持不加引號＝與原本 byte-identical（零回歸）。
  // bottom 以「最後一行」對齊底邊距 → 多行往上長、底邊距一致（單行時與原本相同）。
  const renderGroup = (lines: string[], enable: string, fadeExpr: string, yAnim = ''): string[] => {
    const n = Math.max(1, lines.length);
    const baseTop =
      style?.position === 'top'
        ? `${Math.round(180 * s)}`
        : style?.position === 'center'
          ? `(h-${n * lineH})/2`
          : `h-${Math.round(240 * s) + (n - 1) * lineH}`;
    return lines.map((ln, i) => {
      const f = join(tmpdir(), `sub_${randomUUID()}.txt`);
      writeFileSync(f, ln, 'utf8');
      subFiles.push(f);
      const y = `${baseTop}+${i * lineH}`;
      // yAnim 含逗號的表達式 → 用單引號包起來保護（免被當 filter 選項分隔）；無動畫時維持原本不加引號。
      const yExpr = yAnim ? `'${y}${yAnim}'` : y;
      return (
        `drawtext=fontfile=${escDrawtext(font)}:textfile=${escDrawtext(f)}:` +
        `fontcolor=${color}:fontsize=${fontsize}:borderw=${border}:bordercolor=black@0.85:` +
        `${plate}shadowcolor=black@0.45:shadowx=${sh}:shadowy=${sh}:` +
        `x=(w-text_w)/2:y=${yExpr}${enable}:alpha='${fadeExpr}'`
      );
    });
  };

  // 卡拉OK逐字高亮（highlight=true）：在 pop-on 逐句字幕之上，字隨語音進度由 color「填成」highlightColor。
  // base 與 highlight 兩層都用 charAdvance 逐字排版（同一 x），故 highlight glyph 精準疊在 base glyph 上；
  // 逐字揭示時間依「已朗讀字元比例」映射到該句的語音窗。plate 底板在逐字模式忽略（避免每字重疊成塊；border+
  // shadow 已足夠可讀）。exported-behaviour 透過 subDrawtext 測試（斷言雙層/逐字 enable 遞增）。
  const hlColor = (style?.highlightColor ?? '#FFD400').replace(/[^#\w@.]/g, '') || '#FFD400';
  const renderKaraoke = (lines: string[], start: number, end: number, fadeExpr: string, yAnim: string): string[] => {
    const n = Math.max(1, lines.length);
    const baseTop =
      style?.position === 'top'
        ? `${Math.round(180 * s)}`
        : style?.position === 'center'
          ? `(h-${n * lineH})/2`
          : `h-${Math.round(240 * s) + (n - 1) * lineH}`;
    const nHi = Math.max(1, lines.join('').replace(/ /g, '').length); // 可高亮字元總數（不含空白）
    const fillEnd = Math.max(start + 0.01, Math.min(end, timing!.narrationDur)); // 逐字填色只跨語音窗（末句不含尾靜音）
    const et = end.toFixed(2);
    const out: string[] = [];
    let k = 0; // 全句累計可高亮字元序（跨行連續 → 逐字填色不會每行重來）
    for (let li = 0; li < lines.length; li++) {
      const chars = Array.from(lines[li]);
      const lineW = Math.round(chars.reduce((a, ch) => a + charAdvance(ch, fontsize), 0));
      const yBase = `${baseTop}+${li * lineH}`;
      const yExpr = yAnim ? `'${yBase}${yAnim}'` : yBase;
      let cx = 0;
      for (const ch of chars) {
        const adv = charAdvance(ch, fontsize);
        if (ch === ' ') { cx += adv; continue; } // 空白不畫、只推進
        const f = join(tmpdir(), `sub_${randomUUID()}.txt`);
        writeFileSync(f, ch, 'utf8');
        subFiles.push(f);
        const x = `(w-${lineW})/2+${Math.round(cx)}`;
        const reveal = (start + (k / nHi) * (fillEnd - start)).toFixed(2);
        const common =
          `drawtext=fontfile=${escDrawtext(font)}:textfile=${escDrawtext(f)}:` +
          `fontsize=${fontsize}:borderw=${border}:bordercolor=black@0.85:` +
          `shadowcolor=black@0.45:shadowx=${sh}:shadowy=${sh}:x=${x}:y=${yExpr}`;
        // base（底層，全句顯示窗）＋ highlight（上層，讀到該字才亮並持續到句末）
        out.push(`${common}:fontcolor=${color}:enable='between(t\\,${start.toFixed(2)}\\,${et})':alpha='${fadeExpr}'`);
        out.push(`${common}:fontcolor=${hlColor}:enable='between(t\\,${reveal}\\,${et})':alpha='${fadeExpr}'`);
        k += 1;
        cx += adv;
      }
    }
    return out;
  };

  // Pop-on 動態逐句字幕：把整段旁白切成短句、依語音長度逐句彈出（每句只在自己的時間窗顯示）。
  // kinetic 進場＝0.12s alpha 淡入 ＋ 由下往上 ~22px 滑入（0.18s 內回位）＝現代短影音動態字幕觀感（研究：kinetic
  // typography 提升保留率）。短影音保留率最高的字幕形式。需要 timing（語音長度）才能對齊；否則退回整段模式。
  if (style?.segment && timing && timing.narrationDur > 0) {
    const segs = segmentCaption(text);
    if (segs.length > 1) {
      const rise = Math.round(22 * s);
      const filters: string[] = [];
      for (const { seg, start, end } of captionSegmentTimings(segs, timing.narrationDur, timing.totalDur)) {
        const lines = wrapCjk(seg, segWrapMax).split('\n').filter((l) => l.length > 0);
        const st = start.toFixed(2);
        const enable = `:enable='between(t\\,${st}\\,${end.toFixed(2)})'`;
        const fadeExpr = `if(lt(t-${st}\\,0.12)\\,(t-${st})/0.12\\,1)`;
        // 由 +rise（畫面偏下）在 0.18s 內滑回 0；逗號在 max() 內，靠 yExpr 的單引號保護。
        const yAnim = `+${rise}*max(0,1-(t-${st})/0.18)`;
        if (style?.highlight) filters.push(...renderKaraoke(lines, start, end, fadeExpr, yAnim));
        else filters.push(...renderGroup(lines, enable, fadeExpr, yAnim));
      }
      return { filter: filters.join(','), subFiles };
    }
  }

  // 預設：整段字幕全程顯示，柔和 0.35s alpha 淡入（零回歸；wrap 依字級/寬度動態，小字級＝原 13 字）
  const lines = wrapCjk(text, wrapMax).split('\n').filter((l) => l.length > 0);
  return { filter: renderGroup(lines, '', `if(lt(t\\,0.35)\\,t/0.35\\,1)`).join(','), subFiles };
}

/**
 * 迷因大字幕 drawtext。top = 白色 setup（全程顯示）；bottom = 黃色 punchline（給定 punchAt 時於該秒彈出）。
 * 字級/描邊/位置等比縮放至 canvasH（720p 時 = 原值，零回歸）。
 * 每行各自一個 drawtext 並垂直堆疊 —— 同 subDrawtext，避開 ffmpeg 8.x textfile 換行渲染成 □ 方塊的 bug。
 * 回傳 filter ＋ 寫好的逐行暫存檔（呼叫端負責 unlink）。
 */
/** 迷因大字幕樣式覆寫（顏色/字級，top/bottom 各自可設）。不傳＝舊預設：top 白 62 / bottom 黃 66（零回歸）。 */
export interface MemeCapStyle { topColor?: string; bottomColor?: string; topSize?: number; bottomSize?: number }

// cap＝該側的顏色/字級覆寫（來自 opts.capStyle）；未傳沿用舊預設。exported for unit testing（斷言 drawtext 合約）。
export function memeCaptionFilter(font: string, text: string, kind: "top" | "bottom", canvasH: number, punchAt?: number, cap?: { color?: string; size?: number }): { filter: string; files: string[] } {
  const s = capScale(canvasH);
  const border = Math.max(3, Math.round(6 * s)), ls = Math.round(12 * s);
  const lines = wrapCjk(text, 10).split('\n').filter((l) => l.length > 0);
  const isTop = kind === "top";
  const fontsize = Math.round((cap?.size ?? (isTop ? 62 : 66)) * s);
  const color = cap?.color ?? (isTop ? "white" : "yellow");
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

/** 卡片種類：'title'（片頭標題）、'end'（經典「完」）、'cta'（片尾行動呼籲）。 */
export type CardKind = 'title' | 'end' | 'cta';

/**
 * 卡片文字圖層的純建構器：大標（由下滑入 26px + 0.4s 淡入）＋（title/cta）品牌強調色 kicker 色條 ＋ 可選副標。
 * 回傳依繪製順序排好的 drawbox/drawtext 片段與暫存檔（呼叫端負責 unlink）。y 表達式的逗號在單引號內保留字面值
 * （同 subDrawtext 的 kinetic yExpr）；alpha/enable 的逗號沿用 `\,` 轉義。exported for unit testing; 純（只寫暫存檔）。
 */
export function cardDraws(
  font: string,
  o: { bigText?: string; smallText?: string; accent?: string; kind?: CardKind },
  canvasH: number, canvasW = 720,
): { draws: string[]; files: string[] } {
  const s = capScale(canvasH);
  const kind = o.kind ?? 'title';
  // 只接受合法顏色（#hex 3–8 位 或 顏色名[@alpha]）；任何其他輸入回退預設金（同時擋注入與壞色致渲染失敗）。
  const accent = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+(@[0-9.]+)?$/.test(o.accent ?? '') ? (o.accent as string) : '#FFD400';
  const accentBox = accent.startsWith('#') ? `0x${accent.slice(1)}` : accent; // drawbox 用 0xRRGGBB
  const bigCenter = kind === 'cta' ? 'h*0.47' : 'h*0.42';
  const files: string[] = [];
  const draws: string[] = [];
  // 品牌 kicker 色條（title/cta）：大標上方一小段強調色橫線，0.28s 後彈入（放上方最不會與多行標題重疊）。
  // 注意：drawbox 的 w/h 指「色條自身」尺寸，故置中/垂直錨點必須用輸入尺寸 iw/ih（用 w/h 會算成 0/負值→跑掉）。
  if (kind !== 'end' && o.bigText) {
    const barW = Math.round(canvasW * (kind === 'cta' ? 0.30 : 0.18));
    const barH = Math.max(4, Math.round(8 * s));
    const barY = `ih*${kind === 'cta' ? '0.47' : '0.42'}-${Math.round(74 * s)}`;
    draws.push(`drawbox=x=(iw-${barW})/2:y=${barY}:w=${barW}:h=${barH}:color=${accentBox}:t=fill:enable='gte(t\\,0.28)'`);
  }
  // 大標：由下滑入 26px（0.4s 內回位）＋ 0.4s 淡入。字級隨最長一行等比縮小以塞進畫面（避免長 CTA 溢出邊框）。
  if (o.bigText) {
    const wrapped = wrapCjk(o.bigText, 12);
    const maxLine = Math.max(1, ...wrapped.split('\n').map((l) => l.length));
    const fitSize = Math.floor((canvasW * 0.9) / maxLine); // CJK ≈ 全形；長標題自動縮到塞得下
    const bigSize = Math.max(Math.round(30 * s), Math.min(Math.round(74 * s), fitSize));
    const f = join(tmpdir(), `card_big_${randomUUID()}.txt`);
    writeFileSync(f, wrapped, 'utf8'); files.push(f);
    const rise = Math.round(26 * s);
    draws.push(
      `drawtext=fontfile=${escDrawtext(font)}:textfile=${escDrawtext(f)}:fontcolor=white:` +
      `fontsize=${bigSize}:borderw=${Math.max(2, Math.round(4 * s))}:bordercolor=black@0.6:` +
      `shadowcolor=black@0.5:shadowx=${Math.round(2 * s)}:shadowy=${Math.round(2 * s)}:` +
      `x=(w-text_w)/2:y='${bigCenter}-text_h/2+${rise}*max(0,1-t/0.4)':line_spacing=${Math.round(12 * s)}:` +
      `alpha='if(lt(t\\,0.4)\\,t/0.4\\,1)'`);
  }
  // 副標（片頭前提／CTA 補充）：大標下方，柔和 0.5s 淡入
  if (o.smallText) {
    const f = join(tmpdir(), `card_small_${randomUUID()}.txt`);
    writeFileSync(f, wrapCjk(o.smallText, 20), 'utf8'); files.push(f);
    draws.push(
      `drawtext=fontfile=${escDrawtext(font)}:textfile=${escDrawtext(f)}:fontcolor=white@0.85:` +
      `fontsize=${Math.round(34 * s)}:borderw=${Math.max(1, Math.round(2 * s))}:bordercolor=black@0.5:` +
      `x=(w-text_w)/2:y=${bigCenter}+${Math.round(90 * s)}:line_spacing=${Math.round(8 * s)}:` +
      `alpha='if(lt(t\\,0.5)\\,t/0.5\\,1)'`);
  }
  return { draws, files };
}

/**
 * 章節/場景標題「下三分之一」lower-third：左對齊的品牌強調色細條 ＋ 深色底板標題，於鏡頭開頭淡入、停留
 * holdSec 後淡出（解說片常見的「段落標題」）。放在畫面下三分之一（中央偏下，避開底部旁白字幕）。純函式；
 * exported for unit testing（drawbox 的 y 用 ih，drawtext 的 y 用 h）。
 */
export function lowerThirdDraws(
  font: string,
  o: { text: string; accent?: string; holdSec?: number },
  canvasH: number, canvasW = 720,
): { draws: string[]; files: string[] } {
  const s = capScale(canvasH);
  const accent = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+(@[0-9.]+)?$/.test(o.accent ?? '') ? (o.accent as string) : '#FFD400';
  const accentBox = accent.startsWith('#') ? `0x${accent.slice(1)}` : accent;
  const hold = Math.max(1.5, o.holdSec ?? 2.6);
  const vis = (hold + 0.5).toFixed(2);
  const fontsize = Math.round(38 * s);
  const M = Math.round(canvasW * 0.06);
  const files: string[] = [];
  const draws: string[] = [];
  const enable = `:enable='lt(t\\,${vis})'`;
  // 上方品牌強調色細條（drawbox：置/量都用 ih/iw；enable 視窗內顯示）
  const lineW = Math.round(canvasW * 0.16);
  const lineH = Math.max(3, Math.round(6 * s));
  draws.push(`drawbox=x=${M}:y=ih*0.72-${Math.round(20 * s)}:w=${lineW}:h=${lineH}:color=${accentBox}:t=fill${enable}`);
  // 標題：左對齊、深色底板、0.3s 淡入 → hold → 0.4s 淡出
  const f = join(tmpdir(), `lt_${randomUUID()}.txt`);
  writeFileSync(f, o.text, 'utf8'); files.push(f);
  const alpha = `if(lt(t\\,0.3)\\,t/0.3\\,if(gt(t\\,${hold.toFixed(2)})\\,max(0\\,1-(t-${hold.toFixed(2)})/0.4)\\,1))`;
  draws.push(
    `drawtext=fontfile=${escDrawtext(font)}:textfile=${escDrawtext(f)}:fontcolor=white:fontsize=${fontsize}:` +
    `box=1:boxcolor=black@0.5:boxborderw=${Math.round(12 * s)}:borderw=${Math.max(1, Math.round(1 * s))}:bordercolor=black@0.6:` +
    `x=${M}:y=h*0.72${enable}:alpha='${alpha}'`);
  return { draws, files };
}

/** 浮水印角落位置：tl 左上 / tr 右上 / bl 左下 / br 右下。 */
export type WatermarkPos = 'tl' | 'tr' | 'bl' | 'br';

/**
 * 品牌浮水印（頻道 handle）drawtext：角落、半透明白字＋細描邊/投影，全片常駐。位置/不透明度可調；字級與邊距
 * 隨畫布等比縮放。預設右上（避開置中字幕與底部旁白字幕的衝突）。exported for unit testing; 純（只寫暫存檔）。
 */
export function watermarkDrawtext(
  text: string, font: string,
  o: { position?: WatermarkPos; opacity?: number; canvasH?: number; canvasW?: number } = {},
): { filter: string; files: string[] } {
  const canvasH = o.canvasH && o.canvasH > 0 ? o.canvasH : 1280;
  const canvasW = o.canvasW && o.canvasW > 0 ? o.canvasW : Math.round((canvasH * 9) / 16);
  const s = capScale(canvasH);
  const pos = o.position ?? 'tr';
  const op = Math.max(0.15, Math.min(1, o.opacity ?? 0.55));
  const size = Math.round(26 * s);
  const M = Math.round(canvasW * 0.045);
  const f = join(tmpdir(), `wm_${randomUUID()}.txt`);
  writeFileSync(f, text, 'utf8');
  const x = pos === 'tl' || pos === 'bl' ? `${M}` : `w-text_w-${M}`;
  const y = pos === 'tl' || pos === 'tr' ? `${M}` : `h-text_h-${M}`;
  const filter =
    `drawtext=fontfile=${escDrawtext(font)}:textfile=${escDrawtext(f)}:` +
    `fontcolor=white@${op}:fontsize=${size}:borderw=${Math.max(1, Math.round(1 * s))}:bordercolor=black@${(op * 0.7).toFixed(2)}:` +
    `shadowcolor=black@${(op * 0.5).toFixed(2)}:shadowx=${Math.round(1 * s)}:shadowy=${Math.round(1 * s)}:x=${x}:y=${y}`;
  return { filter, files: [f] };
}

/**
 * 進度條 drawbox filter：底部（或頂部）一條隨播放進度由左增長到滿版的橫條（燒進成片＝觀看剩餘提示，短影音完播
 * 率輔助）。w 用 min(1,t/dur) 夾住，最後停在滿版。color 只接受合法顏色（否則回退金）。純函式；exported for testing。
 */
export function progressBarFilter(
  o: { color?: string; thickness?: number; position?: 'top' | 'bottom'; canvasH?: number; durationSec: number },
): string {
  const canvasH = o.canvasH && o.canvasH > 0 ? o.canvasH : 1280;
  const s = capScale(canvasH);
  const color = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+(@[0-9.]+)?$/.test(o.color ?? '') ? (o.color as string) : '#FFD400';
  const boxColor = color.startsWith('#') ? `0x${color.slice(1)}` : color;
  const h = Math.max(3, Math.round((o.thickness ?? 8) * s));
  const dur = Math.max(0.1, o.durationSec);
  const y = o.position === 'top' ? '0' : `ih-${h}`; // drawbox：ih＝輸入高度
  return `drawbox=x=0:y=${y}:w='iw*min(1\\,t/${dur.toFixed(2)})':h=${h}:color=${boxColor}:t=fill`;
}

/**
 * 電影感收尾 filter：細顆粒膠片噪點（temporal 動態，像真底片）＋暗角 vignette，讓成片有「拍出來的」質感而非乾淨
 * 數位感。intensity 'subtle'（預設，低調）/'strong'（明顯復古）。純函式（解析度無關）。exported for unit testing。
 */
export function filmFinishFilter(o: { intensity?: 'subtle' | 'strong' } = {}): string {
  const strong = o.intensity === 'strong';
  const grain = strong ? 18 : 9;          // noise 強度
  const vig = strong ? 'PI/4' : 'PI/5';   // vignette 角度（越小越暗）
  return `noise=alls=${grain}:allf=t+u,vignette=${vig}`;
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
  grade?: string;        // 每鏡調色風格（GRADE_STYLES key）；不傳＝STUDIO_GRADE_STYLE/teal（零回歸）
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
      `zoompan=z='${zexpr}':x='iw/2-(iw/zoom/2)${dx}':y='ih/2-(ih/zoom/2)${dy}':d=${frames}:s=${W}x${H}:fps=${fps},setsar=1${UNSHARP}${gradeChain(o.grade)}`;
    let subFiles: string[] = [];
    if (o.subtitle) {
      const font = o.fontfile ?? (o.subStyle?.fontKind === 'serif' ? findSerifCjkFont() : findBoldCjkFont()); // 旁白字幕預設粗體（短影音慣例）；fontKind='serif' 改襯線（皆回退 regular）
      if (font) { const sd = subDrawtext(o.subtitle, o.subStyle, font, H, { narrationDur: adur, totalDur: dur }, W); subFiles = sd.subFiles; if (sd.filter) vf += `,${sd.filter}`; }
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
    // xfade/acrossfade 要求所有輸入幀率、時基、取樣率一致 — 混源 clip（lip 25fps / i2v 16fps / still 30fps）先正規化
    for (let i = 0; i < clips.length; i++) {
      fc.push(`[${i}:v]fps=30,settb=AVTB[nv${i}]`);
      fc.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[na${i}]`);
    }
    let vlabel = "nv0", running = durs[0];
    for (let i = 1; i < clips.length; i++) {
      const fade = seamFade(i - 1);
      const offset = running - fade;
      const out = i === clips.length - 1 ? "vout" : `v${i}`;
      fc.push(`[${vlabel}][nv${i}]xfade=transition=${trans(i - 1)}:duration=${fade.toFixed(3)}:offset=${offset.toFixed(3)}[${out}]`);
      vlabel = out;
      running = running + durs[i] - fade;
    }
    let alabel = "na0";
    for (let i = 1; i < clips.length; i++) {
      const fade = seamFade(i - 1);
      const out = i === clips.length - 1 ? "aout" : `a${i}`;
      fc.push(`[${alabel}][na${i}]acrossfade=d=${fade.toFixed(3)}[${out}]`);
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
    grade?: string;
  }): Promise<string> {
    const W = o.width ?? 720, H = o.height ?? 1280, pad = o.pad ?? 0.4;
    const adur = o.voice ? await probeDuration(o.voice) : (o.fallbackDur ?? 4.0);
    const dur = adur + pad;
    let vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1${gradeChain(o.grade)}`;
    let subFiles: string[] = [];
    if (o.subtitle) {
      const font = o.fontfile ?? (o.subStyle?.fontKind === 'serif' ? findSerifCjkFont() : findBoldCjkFont()); // 旁白字幕預設粗體（短影音慣例）；fontKind='serif' 改襯線（皆回退 regular）
      if (font) { const sd = subDrawtext(o.subtitle, o.subStyle, font, H, { narrationDur: adur, totalDur: dur }, W); subFiles = sd.subFiles; if (sd.filter) vf += `,${sd.filter}`; }
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
    grade?: string; capStyle?: MemeCapStyle;
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
      `zoompan=z='${zexpr}':x='iw/2-(iw/zoom/2)${swayX}':y='ih/2-(ih/zoom/2)${swayY}':d=${frames}:s=${W}x${H}:fps=${fps},setsar=1${UNSHARP}${gradeChain(o.grade)}`;

    const font = o.memeFont ?? findBoldCjkFont();
    const tmpFiles: string[] = [];
    if (font && o.topCaption) {
      const cap = memeCaptionFilter(font, o.topCaption, "top", H, undefined, { color: o.capStyle?.topColor, size: o.capStyle?.topSize });
      tmpFiles.push(...cap.files); vf += `,${cap.filter}`;
    }
    if (font && o.bottomCaption) {
      const cap = memeCaptionFilter(font, o.bottomCaption, "bottom", H, o.punchAt, { color: o.capStyle?.bottomColor, size: o.capStyle?.bottomSize });
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
    grade?: string; capStyle?: MemeCapStyle;
  }): Promise<string> {
    const W = o.width ?? 720, H = o.height ?? 1280, pad = o.pad ?? 0.4;
    const adur = o.voice ? await probeDuration(o.voice) : (o.fallbackDur ?? 3.5);
    const dur = adur + pad;
    let vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1${gradeChain(o.grade)}`;
    const font = o.memeFont ?? findBoldCjkFont();
    const tmpFiles: string[] = [];
    if (font && o.topCaption) {
      const cap = memeCaptionFilter(font, o.topCaption, "top", H, undefined, { color: o.capStyle?.topColor, size: o.capStyle?.topSize });
      tmpFiles.push(...cap.files); vf += `,${cap.filter}`;
    }
    if (font && o.bottomCaption) {
      const cap = memeCaptionFilter(font, o.bottomCaption, "bottom", H, o.punchAt, { color: o.capStyle?.bottomColor, size: o.capStyle?.bottomSize });
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
    accent?: string; kind?: CardKind;
  }): Promise<string> {
    const W = o.width ?? 720, H = o.height ?? 1280, fps = o.fps ?? 30, dur = o.dur ?? 2.6;
    const s = capScale(H);
    const fadeOut = Math.max(0, dur - 0.5);
    const font = o.fontfile ?? findBoldCjkFont();
    const built = font ? cardDraws(font, { bigText: o.bigText, smallText: o.smallText, accent: o.accent, kind: o.kind }, H, W) : { draws: [] as string[], files: [] as string[] };
    const draws = built.draws;
    const tmpFiles = built.files;
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

  /**
   * 成片收尾覆蓋一次性合成：把品牌浮水印 + 進度條 + 電影感收尾（膠片噪點/暗角）合併成**單一 -vf 一次重編碼**，
   * 避免逐項各重編碼一次疊加畫質流失、也更快。皆未啟用 → 回原檔不動（不重編碼）。順序：浮水印→進度條→膠片
   * 收尾（噪點/暗角放最後，質感才均勻覆蓋全畫面）。durationSec 供進度條；不傳則 probe。
   */
  async finish(o: {
    video: string; out: string; width?: number; height?: number; durationSec?: number;
    watermark?: { text: string; position?: WatermarkPos; opacity?: number };
    progressBar?: { color?: string; position?: 'top' | 'bottom' };
    filmFinish?: { intensity?: 'subtle' | 'strong' };
  }): Promise<string> {
    const W = o.width ?? 720, H = o.height ?? 1280;
    const parts: string[] = [];
    const tmpFiles: string[] = [];
    if (o.watermark?.text?.trim()) {
      const font = findCjkFont(); // 常規字重：低調不搶戲
      if (font) {
        const wm = watermarkDrawtext(o.watermark.text.trim(), font, { position: o.watermark.position, opacity: o.watermark.opacity, canvasH: H, canvasW: W });
        parts.push(wm.filter); tmpFiles.push(...wm.files);
      }
    }
    if (o.progressBar) {
      const dur = o.durationSec ?? await probeDuration(o.video);
      parts.push(progressBarFilter({ color: o.progressBar.color, position: o.progressBar.position, canvasH: H, durationSec: dur }));
    }
    if (o.filmFinish) parts.push(filmFinishFilter({ intensity: o.filmFinish.intensity }));
    if (parts.length === 0) return o.video; // 沒有任何收尾 → 不動、不重編碼
    const args = ["-y", "-i", o.video, "-vf", parts.join(","), "-c:a", "copy", ...VIDEO_ARGS, o.out];
    const { code, stderr } = await run(FFMPEG, args);
    for (const f of tmpFiles) { try { unlinkSync(f); } catch { /* ignore */ } }
    if (code !== 0) throw new Error(`ffmpeg finish failed (${code}): ${stderr.slice(-1000)}`);
    return o.out;
  }

  /**
   * 章節標題 lower-third 一次性合成：把段落標題燒在鏡頭開頭的下三分之一（重編碼視訊、音訊 copy）。
   * text 為空或無字型 → 回傳原檔不動。
   */
  async lowerThird(o: {
    video: string; out: string; text: string; accent?: string; holdSec?: number;
    width?: number; height?: number; fontfile?: string;
  }): Promise<string> {
    const font = o.fontfile ?? findBoldCjkFont();
    if (!font || !o.text?.trim()) return o.video;
    const { draws, files } = lowerThirdDraws(font, { text: o.text.trim(), accent: o.accent, holdSec: o.holdSec }, o.height ?? 1280, o.width ?? 720);
    const args = ["-y", "-i", o.video, "-vf", draws.join(","), "-c:a", "copy", ...VIDEO_ARGS, o.out];
    const { code, stderr } = await run(FFMPEG, args);
    for (const f of files) { try { unlinkSync(f); } catch { /* ignore */ } }
    if (code !== 0) throw new Error(`ffmpeg lowerThird failed (${code}): ${stderr.slice(-1000)}`);
    return o.out;
  }

}
