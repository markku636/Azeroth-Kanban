import { describe, it, expect } from 'vitest';
import { formatSrtTime, buildSrt, buildVtt } from './subtitles';

describe('formatSrtTime', () => {
  it('HH:MM:SS,mmm；負值夾 0', () => {
    expect(formatSrtTime(0)).toBe('00:00:00,000');
    expect(formatSrtTime(1.5)).toBe('00:00:01,500');
    expect(formatSrtTime(3661.234)).toBe('01:01:01,234');
    expect(formatSrtTime(-5)).toBe('00:00:00,000');
  });
});

describe('buildSrt', () => {
  it('1-based 序號、逗號毫秒、時間箭頭', () => {
    const srt = buildSrt([{ start: 0, end: 2, text: '第一句' }, { start: 2, end: 4.5, text: '第二句' }]);
    expect(srt).toContain('1\r\n00:00:00,000 --> 00:00:02,000\r\n第一句');
    expect(srt).toContain('2\r\n00:00:02,000 --> 00:00:04,500\r\n第二句');
  });
  it('去空白 cue、依 start 排序、end 至少比 start 多 0.3s', () => {
    const srt = buildSrt([{ start: 5, end: 5.1, text: '後' }, { start: 1, end: 2, text: '前' }, { start: 3, end: 3, text: '  ' }]);
    // 空白句被濾掉 → 只有 2 條，且「前」在「後」之前
    expect(srt.indexOf('前')).toBeLessThan(srt.indexOf('後'));
    expect(srt).not.toContain('3\r\n'); // 只有 1、2 兩條
    expect(srt).toContain('00:00:05,000 --> 00:00:05,300'); // end 被撐到 start+0.3s
  });
});

describe('buildVtt', () => {
  it('WEBVTT 標頭 + 點毫秒', () => {
    const vtt = buildVtt([{ start: 0, end: 2, text: 'hi' }]);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:02.000\nhi');
  });
});
