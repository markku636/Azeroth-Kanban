// 從 YouTube 影片取得「腳本／字幕逐字稿」，供 adaptStoryboardFromSource 改編成分鏡。
// 注意：2026 年 YouTube 對伺服器端抓字幕有反爬（同意頁/PO token/bot 偵測），容器內抓取常失敗，
// 因此**主要路徑是使用者貼上逐字稿**，本檔的 URL 抓取為 best-effort，失敗時丟出可行動錯誤請改用貼上。

/** 從各種 YouTube 網址格式抽出 videoId（watch?v=／youtu.be／shorts／embed）。純函式、可測。回傳 null=非 YouTube 網址。 */
export function parseYoutubeId(input: string): string | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  // 純 11 碼 id
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m =
    s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    s.match(/\/shorts\/([A-Za-z0-9_-]{11})/) ||
    s.match(/\/embed\/([A-Za-z0-9_-]{11})/) ||
    s.match(/\/live\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** 把 YouTube timedtext（XML 或 json3）字幕解析成乾淨逐字稿。純函式、可測。 */
export function parseTimedText(body: string): string {
  const b = (body ?? '').trim();
  if (!b) return '';
  // json3 格式：{"events":[{"segs":[{"utf8":"..."}]}]}
  if (b.startsWith('{')) {
    try {
      const j = JSON.parse(b) as { events?: { segs?: { utf8?: string }[] }[] };
      const parts = (j.events ?? []).flatMap((e) => (e.segs ?? []).map((sg) => sg.utf8 ?? ''));
      return cleanTranscript(parts.join(''));
    } catch { /* 落到 XML 解析 */ }
  }
  // XML 格式：<text ...>內容</text>
  const texts: string[] = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(b)) !== null) texts.push(decodeEntities(mm[1]));
  return cleanTranscript(texts.join('\n'));
}

function safeCodePoint(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''; // fromCodePoint（非 fromCharCode）才不會截斷 emoji 等 astral 字元
}
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16))) // 十六進位數值實體
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(+n))                        // 十進位數值實體（含 &#39;）
    .replace(/<[^>]+>/g, ''); // 去殘留標籤
}

function cleanTranscript(s: string): string {
  return s.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

// 非語音字幕提示（只剝這些已知關鍵詞的括號段，避免誤刪劇本裡正常的括號旁白）。
const CUE_MARKER = /[[(【]\s*(music|applause|laughter|laughs?|chuckles?|cheering|silence|background music|sound effects?|inaudible|音樂|音乐|背景音樂|配樂|掌聲|掌声|笑聲|笑声|歡呼|欢呼|過場|转场|轉場|靜音|无声)\s*[)\]】]/gi;

/**
 * 清理「使用者貼上的逐字稿／字幕」雜訊：時間碼、SRT/VTT 結構列、非語音提示、自動字幕的滾動重複行。
 * 讓 AI 改編時看到的是乾淨的敘事文字（時間碼與 [音樂] 之類會稀釋結構判讀）。純函式、可測、對乾淨腳本近乎無操作。
 */
export function cleanSourceTranscript(input: string): string {
  let s = (input ?? '').replace(/\r/g, '');
  if (!s.trim()) return '';
  s = s.replace(/^﻿?WEBVTT[^\n]*/i, ''); // VTT 檔頭
  const out: string[] = [];
  for (const rawLine of s.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;
    if (/^\d+$/.test(line)) continue; // SRT 序號整列
    if (/-->/.test(line) && /\d{1,2}:\d{2}/.test(line)) continue; // SRT/VTT cue 時間列
    // 行首時間碼：0:00 / 00:04 / 1:23:45 / [00:04] /（0:04）等，連續多個一次剝光（結尾的 + 讓整組可重複）
    line = line.replace(/^\s*(?:(?:[[(（]\s*)?(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?\s*(?:[)\]）]\s*)?)+/, '').trim();
    line = line.replace(CUE_MARKER, ' '); // 非語音提示
    line = line.replace(/[ \t]+/g, ' ').trim();
    if (!line) continue;
    if (out.length && out[out.length - 1] === line) continue; // 去掉相鄰重複行（自動字幕滾動）
    out.push(line);
  }
  return out.join('\n').replace(/\n{2,}/g, '\n').trim();
}

export interface YoutubeSource { videoId: string; title: string; transcript: string }

/**
 * Best-effort 從 YouTube 網址抓標題＋字幕逐字稿。抓不到字幕時丟出可行動錯誤（請使用者改貼逐字稿）。
 * 流程：oembed 取標題 → 抓 watch 頁 → 從 ytInitialPlayerResponse 取 captionTracks → 抓 timedtext → 解析。
 */
export async function fetchYoutubeSource(url: string): Promise<YoutubeSource> {
  const videoId = parseYoutubeId(url);
  if (!videoId) throw new Error('這不是有效的 YouTube 網址。請貼 watch?v=、youtu.be 或 shorts 連結，或直接貼上字幕逐字稿。');

  let title = '';
  try {
    const o = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, { signal: AbortSignal.timeout(10_000) });
    if (o.ok) title = ((await o.json()) as { title?: string }).title ?? '';
  } catch { /* 標題可有可無 */ }

  let html = '';
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(15_000),
    });
    html = await r.text();
  } catch (e) {
    throw new Error(`無法連到 YouTube 取得字幕（${e instanceof Error ? e.message : e}）。請改用「貼上字幕逐字稿」。`);
  }

  const tracks = extractCaptionTracks(html);
  if (!tracks.length) {
    throw new Error(`這支影片抓不到字幕軌（可能沒開字幕，或被 YouTube 擋下）。請在 YouTube 開「顯示轉錄稿」複製後貼上，或改貼腳本。${title ? `（影片：${title}）` : ''}`);
  }
  // 依偏好排序（中文 > 英文 > 其他；人工 > asr），逐軌嘗試——第一個能抓到非空逐字稿的就用，
  // 不再因為分數最高那軌剛好抓失敗/內容空就整個放棄（提高抓字幕成功率）。
  let lastErr = '';
  for (const track of orderCaptionTracks(tracks)) {
    try {
      const base = track.baseUrl.replace(/&fmt=\w+/, '');
      const r = await fetch(`${base}&fmt=json3`, { signal: AbortSignal.timeout(15_000) });
      const transcript = parseTimedText(await r.text());
      if (transcript) return { videoId, title, transcript };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`取得字幕內容失敗${lastErr ? `（${lastErr}）` : '（內容是空的）'}。請改用「貼上字幕逐字稿」。`);
}

export interface CaptionTrack { baseUrl: string; lang: string; kind: string }

/** 把字幕軌依偏好排序（中文 > 英文 > 其他；同語言人工字幕優先於 asr）。純函式、可測、不改動輸入陣列。 */
export function orderCaptionTracks(tracks: CaptionTrack[]): CaptionTrack[] {
  return [...tracks].sort((a, b) => score(b) - score(a));
}

/**
 * 從 HTML 中 key 之後抓出第一個「括號平衡」的 JSON 陣列。**正確處理巢狀陣列**（字串內、及 name:{runs:[…]}
 * 這類巢狀 [] 不會誤判結尾）——這正是原本 lazy regex `\[[\s\S]*?\]` 會截斷、導致有字幕的影片也抓不到的 bug。
 * exported for testing; pure。回傳含首尾中括號的字串，或 null。
 */
export function extractJsonArrayAfter(html: string, key: string): string | null {
  const idx = html.indexOf(key);
  if (idx < 0) return null;
  const start = html.indexOf('[', idx);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) return html.slice(start, i + 1); }
  }
  return null;
}

function extractCaptionTracks(html: string): CaptionTrack[] {
  const arr = extractJsonArrayAfter(html, '"captionTracks":');
  if (!arr) return [];
  try {
    const parsed = JSON.parse(arr) as { baseUrl?: string; languageCode?: string; kind?: string }[];
    return parsed.filter((t) => t.baseUrl).map((t) => ({ baseUrl: (t.baseUrl as string).replace(/&amp;/g, '&'), lang: t.languageCode ?? '', kind: t.kind ?? '' }));
  } catch { return []; }
}
function score(t: CaptionTrack): number {
  let s = 0;
  if (/^zh/i.test(t.lang)) s += 10;      // 偏好中文
  else if (/^en/i.test(t.lang)) s += 3;  // 其次英文
  if (t.kind !== 'asr') s += 2;          // 偏好人工字幕
  return s;
}
