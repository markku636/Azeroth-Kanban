import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync } from 'node:fs';
import { wrapCjk, escDrawtext, segmentCaption, captionSegmentTimings, subDrawtext, gradeChain, memeCaptionFilter, charAdvance, cardDraws, watermarkDrawtext, GRADE_STYLE_KEYS, progressBarFilter } from './assemble';

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

describe('charAdvance（逐字排版寬度）', () => {
  it('CJK 全形字 ≈ 1em；ASCII 半形 ≈ 0.5em；空白為細縫', () => {
    expect(charAdvance('字', 40)).toBe(40);      // 漢字全形
    expect(charAdvance('。', 40)).toBe(40);      // 全形標點
    expect(charAdvance('A', 40)).toBe(20);       // 半形英數
    expect(charAdvance('7', 40)).toBe(20);
    expect(charAdvance(' ', 40)).toBeCloseTo(12.8); // 空白 0.32em
  });
});

describe('subDrawtext 卡拉OK逐字高亮（highlight）合約', () => {
  it('segment+highlight：每字雙層（base white + highlight #FFD400）、逐字 reveal 時間遞增、逐字排版(非 text_w)', () => {
    const f = filterOf('三十年了，我才發現真相。', { segment: true, highlight: true, color: 'white' }, { narrationDur: 4, totalDur: 4.4 });
    // 逐字排版：x 用「(w-行寬)/2+位移」而非 text_w 置中
    expect(f).toContain(')/2+');
    expect(f).not.toContain('text_w');
    // 兩層等量：每個可高亮字元各一 base + 一 highlight
    const base = f.split('fontcolor=white').length - 1;
    const hi = f.split('fontcolor=#FFD400').length - 1;
    expect(hi).toBeGreaterThanOrEqual(4);
    expect(hi).toBe(base);
    // 逐字 reveal 時間非遞減（依朗讀進度填色）
    const reveals = Array.from(f.matchAll(/#FFD400:enable='between\(t\\,([\d.]+)\\,/g), (m) => parseFloat(m[1]));
    expect(reveals.length).toBe(hi);
    for (let i = 1; i < reveals.length; i++) expect(reveals[i]).toBeGreaterThanOrEqual(reveals[i - 1]);
  });

  it('highlightColor 可覆寫高亮色', () => {
    const f = filterOf('前面一句話，後面又一句。', { segment: true, highlight: true, highlightColor: '#00FF88' }, { narrationDur: 3, totalDur: 3.4 });
    expect(f).toContain('fontcolor=#00FF88');
    expect(f).not.toContain('#FFD400');
  });

  it('highlight 需要 segment：無 segment 時不走逐字（零回歸）', () => {
    const f = filterOf('一句沒開逐句的旁白', { highlight: true, color: 'white' }, { narrationDur: 3, totalDur: 3.4 });
    expect(f).not.toContain('#FFD400');
    expect(f).toContain("alpha='if(lt(t\\,0.35)"); // 走整段淡入
  });

  it('highlight 時忽略 plate 底板（避免逐字底板疊成塊）', () => {
    const f = filterOf('忙背景也要逐字高亮的句子。', { segment: true, highlight: true, plate: true }, { narrationDur: 3, totalDur: 3.4 });
    expect(f).not.toContain('box=1');
  });
});

describe('cardDraws（片頭／片尾卡片建構器）', () => {
  const clean = (r: { files: string[] }) => { for (const f of r.files) { try { unlinkSync(f); } catch { /* noop */ } } };
  it('title：大標由下滑入+淡入、上方品牌 kicker 色條(預設金)、無「end」', () => {
    const r = cardDraws('C:/f.ttf', { bigText: '三十年的祕密', smallText: '一個沒人敢說的真相', kind: 'title' }, 1280, 720);
    const all = r.draws.join(';');
    expect(all).toContain('drawbox='); // kicker 色條
    expect(all).toContain('color=0xFFD400'); // 預設金強調色（drawbox 用 0x）
    expect(all).toContain('max(0,1-t/0.4)'); // 大標滑入
    expect(all).toContain("h*0.42"); // title 垂直錨點
    expect(r.draws.filter((d) => d.startsWith('drawtext=')).length).toBe(2); // 大標 + 副標
    clean(r);
  });
  it('cta：自訂強調色、CTA 錨點較低(h*0.47)、色條較寬', () => {
    const r = cardDraws('C:/f.ttf', { bigText: '喜歡就追蹤', accent: '#C81E2E', kind: 'cta' }, 1280, 720);
    const all = r.draws.join(';');
    expect(all).toContain('color=0xC81E2E');
    expect(all).toContain('h*0.47');
    clean(r);
  });
  it('end：經典「完」無色條(僅大標)', () => {
    const r = cardDraws('C:/f.ttf', { bigText: '完', kind: 'end' }, 1280, 720);
    expect(r.draws.some((d) => d.startsWith('drawbox='))).toBe(false);
    expect(r.draws.filter((d) => d.startsWith('drawtext=')).length).toBe(1);
    clean(r);
  });
  it('accent 過濾非法字元（防注入）', () => {
    const r = cardDraws('C:/f.ttf', { bigText: 'X', accent: '#FF0000;drawbox=evil', kind: 'title' }, 1280, 720);
    expect(r.draws.join(';')).not.toContain('evil');
    clean(r);
  });
});

describe('watermarkDrawtext（品牌浮水印）', () => {
  const clean = (r: { files: string[] }) => { for (const f of r.files) { try { unlinkSync(f); } catch { /* noop */ } } };
  it('預設右上：x 靠右(w-text_w)、y 靠上邊距、半透明白字，寫一個暫存檔', () => {
    const r = watermarkDrawtext('@markku', 'C:/f.ttf', { canvasH: 1280, canvasW: 720 });
    expect(r.filter).toContain('w-text_w-'); // 靠右
    expect(r.filter).toContain('fontcolor=white@0.55'); // 預設不透明度
    expect(r.filter).not.toContain('h-text_h-'); // 頂部，非底部
    expect(r.files.length).toBe(1);
    clean(r);
  });
  it('左下：x 為邊距數字、y 靠下邊距', () => {
    const r = watermarkDrawtext('@x', 'C:/f.ttf', { position: 'bl', canvasH: 1280, canvasW: 720 });
    expect(r.filter).toContain('h-text_h-'); // 底部
    expect(r.filter).toMatch(/:x=\d+:/); // 左：x 為固定邊距數字
    clean(r);
  });
  it('不透明度夾在 0.15~1', () => {
    const hi = watermarkDrawtext('@x', 'C:/f.ttf', { opacity: 2 });
    expect(hi.filter).toContain('white@1'); clean(hi);
    const lo = watermarkDrawtext('@x', 'C:/f.ttf', { opacity: 0 });
    expect(lo.filter).toContain('white@0.15'); clean(lo);
  });
});

describe('progressBarFilter（進度條）', () => {
  it('底部：drawbox 於 ih-h、寬度隨 t 增長並夾在 1、預設金', () => {
    const f = progressBarFilter({ durationSec: 30, canvasH: 1280 });
    expect(f).toContain('drawbox=');
    expect(f).toContain('color=0xFFD400'); // 預設金（drawbox 用 0x）
    expect(f).toContain('min(1'); // 進度夾住
    expect(f).toContain('t/30.00'); // 依總時長
    expect(f).toContain('y=ih-'); // 底部（用 ih）
  });
  it('頂部：y=0；自訂色', () => {
    const f = progressBarFilter({ durationSec: 12, position: 'top', color: '#00FF00' });
    expect(f).toContain('y=0:');
    expect(f).toContain('color=0x00FF00');
  });
  it('非法色 → 回退金', () => {
    expect(progressBarFilter({ durationSec: 5, color: 'evil;drawbox' })).toContain('color=0xFFD400');
  });
});

// 調色 filter 鏈：無參數＝重構前 GRADE 常數逐字元相同（零回歸）；具名 style 逐鏡覆寫。
describe('gradeChain（調色鏈）', () => {
  // 隔離 env：測試前清掉 STUDIO_GRADE / STUDIO_GRADE_STYLE，測試後還原
  const ENV_KEYS = ['STUDIO_GRADE', 'STUDIO_GRADE_STYLE'] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => { for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  // 重構前的模組層級 GRADE 常數值（預設 env 下）——寫死在測試裡逐字元對比＝零回歸保證
  const LEGACY_GRADE = ',eq=contrast=1.06:saturation=1.08:gamma=0.98,colorbalance=rs=-0.015:bs=0.025:rh=0.03:bh=-0.025';

  it('無參數＝重構前 GRADE 常數逐字元相等（預設 teal，含前導逗號）', () => {
    expect(gradeChain()).toBe(LEGACY_GRADE);
  });

  it('STUDIO_GRADE=off → 空字串（同舊常數；具名 style 也全域關閉）', () => {
    process.env.STUDIO_GRADE = 'off';
    expect(gradeChain()).toBe('');
    expect(gradeChain('horror')).toBe('');
  });

  it('STUDIO_GRADE_STYLE env 回退（同舊常數）；未知 style → teal', () => {
    process.env.STUDIO_GRADE_STYLE = 'noir';
    expect(gradeChain()).toBe(',eq=contrast=1.18:saturation=0.55:gamma=0.95');
    expect(gradeChain('不存在的風格')).toBe(LEGACY_GRADE);
  });

  it("gradeChain('horror') 含 vignette 與 noise（驚悚 look）", () => {
    const g = gradeChain('horror');
    expect(g).toContain('vignette=');
    expect(g).toContain('noise=');
  });

  it('新增 looks 都有對應 filter：mono 去色、film/dreamy 提亮、cyber 高飽和', () => {
    expect(gradeChain('mono')).toContain('saturation=0'); // 黑白
    expect(gradeChain('clean')).toContain('brightness=0.02');
    expect(gradeChain('cyber')).toContain('saturation=1.14');
    expect(gradeChain('film')).toContain('colorbalance');
    // 未知 look 仍回退 teal（不會炸）
    expect(gradeChain('nope')).toBe(LEGACY_GRADE);
  });

  it('GRADE_STYLE_KEYS 匯出所有 look key（含新舊）', () => {
    for (const k of ['teal', 'warm', 'cool', 'noir', 'vivid', 'horror', 'clean', 'film', 'mono', 'dreamy', 'cyber']) {
      expect(GRADE_STYLE_KEYS).toContain(k);
    }
  });
});

// helper: run memeCaptionFilter, clean up its temp files, return the filter string
function memeFilterOf(text: string, kind: 'top' | 'bottom', punchAt?: number, cap?: { color?: string; size?: number }): string {
  const { filter, files } = memeCaptionFilter('C:/f.ttf', text, kind, 1280, punchAt, cap);
  for (const f of files) { try { unlinkSync(f); } catch { /* ignore */ } }
  return filter;
}

// 迷因大字幕合約：不傳 capStyle＝舊預設 top 白 62 / bottom 黃 66（零回歸）；capStyle 可覆寫顏色/字級。
describe('memeCaptionFilter（迷因大字幕合約）', () => {
  it('不傳 capStyle：top 白色 62、全程顯示（memeStill 舊行為）', () => {
    const f = memeFilterOf('人到中年', 'top');
    expect(f).toContain('fontcolor=white');
    expect(f).toContain('fontsize=62');
    expect(f).not.toContain('enable='); // top setup 全程顯示
  });

  it('不傳 capStyle：bottom 黃色 66、punchAt 彈出時間窗', () => {
    const f = memeFilterOf('結果是這樣', 'bottom', 1.5);
    expect(f).toContain('fontcolor=yellow');
    expect(f).toContain('fontsize=66');
    expect(f).toContain("enable='gte(t\\,1.50)'");
  });

  it('capStyle 覆寫顏色與字級（驚悚紅字等）', () => {
    const f = memeFilterOf('入夜之後', 'top', undefined, { color: 'red', size: 70 });
    expect(f).toContain('fontcolor=red');
    expect(f).toContain('fontsize=70');
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
