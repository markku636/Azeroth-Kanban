import { describe, it, expect } from 'vitest';
import { wrapCjk, escDrawtext, segmentCaption } from './assemble';

// 字幕 CJK 軟換行：避免單行寬過畫面；句末標點提早斷行讓字幕更好讀。
describe('wrapCjk', () => {
  it('短句不換行', () => {
    expect(wrapCjk('短句')).toBe('短句');
  });

  it('超過 13 字 → 在 13 字處換行', () => {
    const r = wrapCjk('一二三四五六七八九十一二三四'); // 14 字
    const lines = r.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0].length).toBe(13);
    expect(lines[1]).toBe('四');
  });

  it('句末標點（。！？）且該行 ≥4 字 → 提早斷行', () => {
    expect(wrapCjk('這是一句。後面還有')).toBe('這是一句。\n後面還有');
  });

  it('句末標點但該行 <4 字 → 不斷（避免太碎）', () => {
    expect(wrapCjk('好。')).toBe('好。');
  });

  it('可自訂每行上限', () => {
    expect(wrapCjk('一二三四五', 3)).toBe('一二三\n四五');
  });
});

// pop-on 動態逐句字幕的切句器：標點優先、長句切塊、碎片合併、去尾部軟標點。
describe('segmentCaption（pop-on 逐句字幕切句）', () => {
  it('空字串 → 空陣列', () => {
    expect(segmentCaption('')).toEqual([]);
    expect(segmentCaption('   ')).toEqual([]);
  });

  it('依標點切句、去掉尾部軟逗號、保留句末。！？', () => {
    expect(segmentCaption('三十年了，我才發現真相。')).toEqual(['三十年了', '我才發現真相。']);
  });

  it('長句切成 <=maxLen 的塊', () => {
    const segs = segmentCaption('我一直以為皮卡丘是我最強的夥伴');
    expect(segs.every((s) => s.length <= 9)).toBe(true);
    expect(segs.join('')).toBe('我一直以為皮卡丘是我最強的夥伴');
  });

  it('過短碎片（<minLen）合併進前一段，避免閃太快', () => {
    // "好嗎？" 3 字會獨立；"對" 1 字併回前段
    const segs = segmentCaption('這樣真的可以嗎，對');
    expect(segs.some((s) => s.length < 3)).toBe(false);
  });

  it('單一無標點短句 → 原樣單段', () => {
    expect(segmentCaption('加油吧阿智')).toEqual(['加油吧阿智']);
  });

  it('切句後接回原文（去除軟標點與空白後內容不遺失）', () => {
    const text = '直到今天，我才發現，牠根本不是皮卡丘。';
    const joined = segmentCaption(text).join('');
    expect(joined).toContain('直到今天');
    expect(joined).toContain('牠根本不是皮卡丘。');
  });
});

describe('escDrawtext（ffmpeg drawtext 路徑轉義）', () => {
  it('反斜線轉成正斜線、磁碟機冒號轉義（Windows 路徑）', () => {
    expect(escDrawtext('C:\\fonts\\a.ttf')).toBe('C\\\\:/fonts/a.ttf');
  });

  it('沒有特殊字元的路徑原樣保留', () => {
    expect(escDrawtext('/tmp/sub.txt')).toBe('/tmp/sub.txt');
  });

  it('結果不再有原始反斜線分隔', () => {
    expect(escDrawtext('D:\\a\\b\\c.txt')).not.toContain('\\a');
  });
});
