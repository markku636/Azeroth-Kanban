import { describe, it, expect } from 'vitest';
import { parseYoutubeId, parseTimedText, extractJsonArrayAfter } from './youtube-import';

describe('parseYoutubeId（各種 YouTube 網址格式）', () => {
  it('watch?v=', () => { expect(parseYoutubeId('https://www.youtube.com/watch?v=My3zF7omEfw')).toBe('My3zF7omEfw'); });
  it('watch?v= 帶其他參數', () => { expect(parseYoutubeId('https://www.youtube.com/watch?v=My3zF7omEfw&t=30s&list=x')).toBe('My3zF7omEfw'); });
  it('youtu.be 短網址', () => { expect(parseYoutubeId('https://youtu.be/My3zF7omEfw?si=abc')).toBe('My3zF7omEfw'); });
  it('shorts', () => { expect(parseYoutubeId('https://www.youtube.com/shorts/My3zF7omEfw')).toBe('My3zF7omEfw'); });
  it('embed', () => { expect(parseYoutubeId('https://www.youtube.com/embed/My3zF7omEfw')).toBe('My3zF7omEfw'); });
  it('純 11 碼 id', () => { expect(parseYoutubeId('My3zF7omEfw')).toBe('My3zF7omEfw'); });
  it('非 YouTube 網址 → null', () => { expect(parseYoutubeId('https://vimeo.com/12345')).toBeNull(); });
  it('空字串 → null', () => { expect(parseYoutubeId('')).toBeNull(); });
});

describe('parseTimedText（字幕解析）', () => {
  it('json3 格式：串接 segs.utf8（join 空字串）', () => {
    const j = JSON.stringify({ events: [{ segs: [{ utf8: '你好' }, { utf8: '世界' }] }, { segs: [{ utf8: '再見' }] }] });
    expect(parseTimedText(j)).toBe('你好世界再見');
  });
  it('json3：內容包含所有片段文字', () => {
    const j = JSON.stringify({ events: [{ segs: [{ utf8: '三十年了' }] }, { segs: [{ utf8: '我才發現' }] }] });
    const r = parseTimedText(j);
    expect(r).toContain('三十年了');
    expect(r).toContain('我才發現');
  });
  it('XML 格式：抽出 <text> 並解碼 entities', () => {
    const xml = '<transcript><text start="0">阿智 &amp; 皮卡丘</text><text start="2">&#39;冠軍之路&#39;</text></transcript>';
    const r = parseTimedText(xml);
    expect(r).toContain('阿智 & 皮卡丘');
    expect(r).toContain("'冠軍之路'");
  });
  it('XML 十六進位數值實體 &#x1F600; → 正確 emoji（非截斷）', () => {
    const r = parseTimedText('<transcript><text>笑死 &#x1F600;</text></transcript>');
    expect(r).toContain('😀');
  });
  it('XML 十進位數值實體 &#128512; → 正確 emoji（fromCodePoint 非 fromCharCode）', () => {
    const r = parseTimedText('<transcript><text>&#128512;</text></transcript>');
    expect(r).toBe('😀');
    expect(r.codePointAt(0)).toBe(0x1f600);
  });
  it('空輸入 → 空字串', () => { expect(parseTimedText('')).toBe(''); });
});

// 括號平衡抽取：修掉原本 lazy regex 遇到巢狀陣列（如 name.runs）就截斷、導致有字幕影片也抓不到的 bug。
describe('extractJsonArrayAfter（巢狀陣列不截斷）', () => {
  it('caption track 的 name.runs 巢狀陣列不會讓抽取提早結束', () => {
    const html = '...blah "captionTracks":[{"baseUrl":"https://x/t?v=1","name":{"runs":[{"text":"中文"}]},"languageCode":"zh"}],"more":1...';
    const arr = extractJsonArrayAfter(html, '"captionTracks":');
    expect(arr).not.toBeNull();
    const parsed = JSON.parse(arr as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].baseUrl).toBe('https://x/t?v=1');
    expect(parsed[0].languageCode).toBe('zh');
  });
  it('字串內的 ] 不會被當成陣列結尾', () => {
    const html = '"captionTracks":[{"baseUrl":"https://x/t?a=]b","languageCode":"en"}]';
    const arr = extractJsonArrayAfter(html, '"captionTracks":');
    const parsed = JSON.parse(arr as string);
    expect(parsed[0].baseUrl).toBe('https://x/t?a=]b');
  });
  it('多個 track（含巢狀）全部保留', () => {
    const html = '"captionTracks":[{"baseUrl":"u1","name":{"runs":[{"text":"a"}]}},{"baseUrl":"u2","languageCode":"zh"}]';
    const parsed = JSON.parse(extractJsonArrayAfter(html, '"captionTracks":') as string);
    expect(parsed).toHaveLength(2);
  });
  it('找不到 key → null', () => { expect(extractJsonArrayAfter('nothing here', '"captionTracks":')).toBeNull(); });
});
