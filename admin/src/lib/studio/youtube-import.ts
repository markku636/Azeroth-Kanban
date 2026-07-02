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

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/<[^>]+>/g, ''); // 去殘留標籤
}

function cleanTranscript(s: string): string {
  return s.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
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
  // 偏好中文，其次任何語言；優先人工字幕（kind!=asr）
  const pick = tracks.sort((a, b) => score(b) - score(a))[0];
  let sub = '';
  try {
    const base = pick.baseUrl.replace(/&fmt=\w+/, '');
    const r = await fetch(`${base}&fmt=json3`, { signal: AbortSignal.timeout(15_000) });
    sub = await r.text();
  } catch (e) {
    throw new Error(`取得字幕內容失敗（${e instanceof Error ? e.message : e}）。請改用「貼上字幕逐字稿」。`);
  }
  const transcript = parseTimedText(sub);
  if (!transcript) throw new Error('字幕內容是空的。請改用「貼上字幕逐字稿」。');
  return { videoId, title, transcript };
}

interface CaptionTrack { baseUrl: string; lang: string; kind: string }
function extractCaptionTracks(html: string): CaptionTrack[] {
  const m = html.match(/"captionTracks":(\[[\s\S]*?\])/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[1]) as { baseUrl?: string; languageCode?: string; kind?: string; vssId?: string }[];
    return arr.filter((t) => t.baseUrl).map((t) => ({ baseUrl: t.baseUrl as string, lang: t.languageCode ?? '', kind: t.kind ?? '' }));
  } catch { return []; }
}
function score(t: CaptionTrack): number {
  let s = 0;
  if (/^zh/i.test(t.lang)) s += 10;      // 偏好中文
  else if (/^en/i.test(t.lang)) s += 3;  // 其次英文
  if (t.kind !== 'asr') s += 2;          // 偏好人工字幕
  return s;
}
