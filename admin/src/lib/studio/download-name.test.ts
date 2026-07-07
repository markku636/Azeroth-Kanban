import { describe, it, expect } from 'vitest';
import { sanitizeFilename, contentDisposition } from './download-name';

describe('sanitizeFilename', () => {
  it('去 Windows 保留字元/控制字元、壓縮空白、截長', () => {
    expect(sanitizeFilename('三十年的祕密: 真相/曝光?')).toBe('三十年的祕密 真相 曝光');
    expect(sanitizeFilename('  a   b  ')).toBe('a b');
    expect(sanitizeFilename('x'.repeat(100)).length).toBe(60);
  });
});

describe('contentDisposition', () => {
  it('中文標題 → filename* UTF-8 編碼 + ASCII fallback 用預設', () => {
    const d = contentDisposition('三十年的祕密', 'subtitles', 'srt');
    expect(d).toContain(`filename*=UTF-8''${encodeURIComponent('三十年的祕密.srt')}`);
    expect(d).toContain('filename="subtitles.srt"'); // 全中文 → ASCII fallback 退預設
  });
  it('英文標題 → 兩者都用標題；引號被剝除', () => {
    const d = contentDisposition('My "Great" Video', 'video', 'mp4');
    expect(d).toContain('filename="My Great Video.mp4"');
  });
  it('空/None 標題 → 用 fallbackBase', () => {
    expect(contentDisposition('', 'thumbnail', 'jpg')).toContain('filename="thumbnail.jpg"');
    expect(contentDisposition(null, 'storyboard', 'png')).toContain(`filename*=UTF-8''storyboard.png`);
  });
});
