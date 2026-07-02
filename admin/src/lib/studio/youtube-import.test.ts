import { describe, it, expect } from 'vitest';
import { parseYoutubeId, parseTimedText } from './youtube-import';

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
  it('空輸入 → 空字串', () => { expect(parseTimedText('')).toBe(''); });
});
