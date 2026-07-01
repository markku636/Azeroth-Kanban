import { describe, it, expect } from 'vitest';
import { unlinkSync } from 'node:fs';
import { wrapCjk, escDrawtext, segmentCaption, captionSegmentTimings, subDrawtext } from './assemble';

// helper: run subDrawtext, clean up its temp files, return the filter string
function filterOf(text: string, style: Parameters<typeof subDrawtext>[1], timing?: Parameters<typeof subDrawtext>[4]): string {
  const { filter, subFiles } = subDrawtext(text, style, 'C:/f.ttf', 1280, timing);
  for (const f of subFiles) { try { unlinkSync(f); } catch { /* ignore */ } }
  return filter;
}

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

// pop-on 逐句字幕的時間分配：依字數比例排在語音時間軸上，最後一句撐到片尾。
describe('captionSegmentTimings（pop-on 時間分配）', () => {
  it('第一句從 0 開始、各句依序不重疊', () => {
    const t = captionSegmentTimings(['三十年了', '我才發現真相'], 6, 6.45);
    expect(t[0].start).toBe(0);
    expect(t[0].end).toBeCloseTo(t[1].start, 5); // 前一句結束 = 下一句開始
    expect(t[1].start).toBeGreaterThan(t[0].start);
  });

  it('最後一句撐到片尾 + 1（停頓時字不消失）', () => {
    const t = captionSegmentTimings(['a', 'bb', 'ccc'], 5, 5.4);
    expect(t[t.length - 1].end).toBe(6.4);
  });

  it('時間比例正比於字數', () => {
    // 字數 2 : 6 → 第一句佔 narrationDur 的 1/4
    const t = captionSegmentTimings(['aa', 'bbbbbb'], 8, 8.5);
    expect(t[0].end).toBeCloseTo(2, 5); // 2/8 * 8
    expect(t[1].start).toBeCloseTo(2, 5);
  });

  it('單句：從 0 到片尾+1', () => {
    const t = captionSegmentTimings(['只有一句'], 4, 4.4);
    expect(t).toHaveLength(1);
    expect(t[0].start).toBe(0);
    expect(t[0].end).toBe(5.4);
  });
});

// 字幕 drawtext filter 合約：預設整段（零回歸）／底板 box／pop-on 逐句時間窗＋kinetic 滑入。
describe('subDrawtext filter 合約', () => {
  it('預設（無 segment）：整段一次顯示、0.35s 淡入、y 不加引號、無底板', () => {
    const f = filterOf('這是一句旁白', { fontSize: 42, color: 'white' });
    expect(f).toContain('drawtext=');
    expect(f).toContain("alpha='if(lt(t\\,0.35)\\,t/0.35\\,1)'"); // 整段淡入
    expect(f).not.toContain('box=1'); // 預設無底板
    expect(f).not.toContain('between(t'); // 預設無逐句時間窗
  });

  it('plate=true：加半透明底板 box', () => {
    const f = filterOf('忙背景字幕', { color: 'white', plate: true });
    expect(f).toContain('box=1:boxcolor=black@0.5');
  });

  it('segment + timing：逐句 enable 時間窗 + kinetic 滑入(max) + 引號包住 y', () => {
    const f = filterOf('三十年了，我才發現真相。', { segment: true }, { narrationDur: 4, totalDur: 4.4 });
    // 多句 → 多個 drawtext，各有 between() 時間窗
    expect(f.match(/enable='between\(t/g)?.length).toBeGreaterThanOrEqual(2);
    expect(f).toContain('max(0,1-'); // kinetic 由下滑入
    expect(f).toContain("y='"); // 含逗號的 y 表達式用引號保護
  });

  it('segment 但只有一段（無法切多句）→ 退回整段模式（零回歸）', () => {
    const f = filterOf('好', { segment: true }, { narrationDur: 2, totalDur: 2.4 });
    expect(f).not.toContain('between(t'); // 單段 → 走整段淡入路徑
    expect(f).toContain("alpha='if(lt(t\\,0.35)");
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
