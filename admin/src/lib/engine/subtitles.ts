// subtitles.ts — 由「每鏡旁白 + 時間軸」產生 SRT / WebVTT 字幕檔（純函式、零副作用）。用途：讓創作者拿到可上
// 傳 YouTube CC / 無障礙 / 二次剪輯的字幕檔，不必只靠燒進畫面的字幕。時間軸由 assembleClips 依實際 clip 時長算好。

export interface CueEntry { start: number; end: number; text: string }

/** 秒 → SRT 時間戳 HH:MM:SS,mmm（逗號毫秒）。負值夾 0。 */
export function formatSrtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(milli, 3)}`;
}

/** 過濾/夾正 cue：去空白文字、end 至少比 start 多 0.3s、依 start 排序。純函式。 */
function normalizeCues(entries: CueEntry[]): CueEntry[] {
  return entries
    .map((e) => ({ start: Math.max(0, e.start), end: e.end, text: (e.text ?? '').trim() }))
    .filter((e) => e.text.length > 0)
    .map((e) => ({ ...e, end: Math.max(e.end, e.start + 0.3) }))
    .sort((a, b) => a.start - b.start);
}

/** 產生標準 SRT 字幕字串（1-based 序號、逗號毫秒、CRLF 換行）。 */
export function buildSrt(entries: CueEntry[]): string {
  const cues = normalizeCues(entries);
  return cues
    .map((c, i) => `${i + 1}\r\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\r\n${c.text}\r\n`)
    .join('\r\n');
}

/** 產生 WebVTT 字幕字串（點毫秒、WEBVTT 標頭）。 */
export function buildVtt(entries: CueEntry[]): string {
  const cues = normalizeCues(entries);
  const body = cues
    .map((c) => `${formatSrtTime(c.start).replace(',', '.')} --> ${formatSrtTime(c.end).replace(',', '.')}\n${c.text}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

export interface ChapterEntry { start: number; title: string }

/** 秒 → YouTube 章節時間戳：<1h 用 M:SS，≥1h 用 H:MM:SS。 */
export function formatChapterTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * 產生 YouTube「章節」清單（貼進影片說明即成可點章節）。規則：依 start 排序、去空白標題、**第一個章節強制 0:00**
 * （YouTube 硬性要求），時間戳單調不減。純函式。回空字串代表章節不足（呼叫端據此決定不輸出）。
 */
export function buildChapters(entries: ChapterEntry[]): string {
  const sorted = entries
    .map((e) => ({ start: Math.max(0, e.start), title: (e.title ?? '').trim() }))
    .filter((e) => e.title.length > 0)
    .sort((a, b) => a.start - b.start);
  if (sorted.length === 0) return '';
  let prev = -1;
  const lines = sorted.map((c, i) => {
    let t = i === 0 ? 0 : c.start; // 第一個章節必為 0:00
    if (t <= prev) t = prev + 1;   // 單調遞增，避免同秒重複
    prev = t;
    return `${formatChapterTime(t)} ${c.title}`;
  });
  return lines.join('\n');
}
