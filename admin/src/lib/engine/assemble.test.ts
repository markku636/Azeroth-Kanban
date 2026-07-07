import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync } from 'node:fs';
import { wrapCjk, escDrawtext, segmentCaption, captionSegmentTimings, subDrawtext, gradeChain, memeCaptionFilter, charAdvance, cardDraws, watermarkDrawtext, GRADE_STYLE_KEYS, progressBarOverlay, lowerThirdDraws, filmFinishFilter, thumbnailDraws, THUMBNAIL_VARIANTS, repurposeFilter, contactSheetLayout, motionForEmotion, Compositor } from './assemble';

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

  it('safeArea=true：底部字幕邊距 240→340（避開平台 UI）；卡拉OK路徑同樣生效', () => {
    expect(filterOf('安全區測試', {})).toContain('y=h-240');
    expect(filterOf('安全區測試', { safeArea: true })).toContain('y=h-340');
    const karaoke = filterOf('前面一句，後面一句。', { segment: true, highlight: true, safeArea: true }, { narrationDur: 3, totalDur: 3.4 });
    expect(karaoke).toContain('h-340');
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

describe('Compositor.finish（收尾覆蓋合併一次編碼）', () => {
  it('無任何收尾 → 回原檔、不重編碼（不 spawn ffmpeg）', async () => {
    const comp = new Compositor();
    const r = await comp.finish({ video: 'input.mp4', out: 'output.mp4' });
    expect(r).toBe('input.mp4'); // 直接回原檔（parts 為空的 early return）
  });
});

describe('motionForEmotion（情緒驅動鏡頭運動）', () => {
  it('緊張快推進、悲傷慢漂移、興奮有勁、平靜輕柔', () => {
    expect(motionForEmotion('緊張')!.zoomRate).toBeGreaterThan(0.0009); // 比預設快
    expect(motionForEmotion('悲傷')!.zoomRate).toBeLessThan(0.0009);   // 比預設慢
    expect(motionForEmotion('興奮')!.zoomMax).toBeGreaterThan(1.15);
    expect(motionForEmotion('療癒')!.zoomMax).toBeLessThan(1.15);
    expect(motionForEmotion('tense build-up')!.zoomRate).toBe(0.0018); // 英文也吃
  });
  it('未知/空情緒 → undefined（still 預設，零回歸）', () => {
    expect(motionForEmotion('中性敘述')).toBeUndefined();
    expect(motionForEmotion('')).toBeUndefined();
    expect(motionForEmotion(null)).toBeUndefined();
  });
});

describe('contactSheetLayout（分鏡總覽網格）', () => {
  it('9:16 → 6 欄直式 cell；16:9 → 4 欄橫式；1:1 → 5 欄方形', () => {
    expect(contactSheetLayout(30, '9:16')).toMatchObject({ cols: 6, rows: 5, cellW: 202, cellH: 360 });
    expect(contactSheetLayout(8, '16:9')).toMatchObject({ cols: 4, rows: 2, cellW: 320, cellH: 180 });
    expect(contactSheetLayout(10, '1:1')).toMatchObject({ cols: 5, rows: 2, cellW: 240, cellH: 240 });
  });
  it('張數少於欄數 → 欄數收斂為張數；至少 1x1', () => {
    expect(contactSheetLayout(3, '9:16')).toMatchObject({ cols: 3, rows: 1 });
    expect(contactSheetLayout(0, '9:16')).toMatchObject({ cols: 1, rows: 1 });
  });
});

describe('repurposeFilter（平台重製 blur-pad）', () => {
  it('背景放大裁滿+模糊壓暗、主畫面等比塞入、置中 overlay、輸出 [v]', () => {
    const f = repurposeFilter(1280, 720);
    expect(f).toContain('split=2[bg][fg]');
    expect(f).toContain('scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,gblur');
    expect(f).toContain('scale=1280:720:force_original_aspect_ratio=decrease');
    expect(f).toContain('overlay=(W-w)/2:(H-h)/2');
    expect(f.endsWith('[v]')).toBe(true);
  });
});

describe('thumbnailDraws（YouTube 封面縮圖文字層）', () => {
  const clean = (r: { files: string[] }) => { for (const f of r.files) { try { unlinkSync(f); } catch { /* noop */ } } };
  it('kicker 色條＋逐行大標（底板+粗描邊）、標題最多兩行、每行一暫存檔', () => {
    const r = thumbnailDraws('C:/f.ttf', { title: '三十年的祕密終於曝光了真相', accent: '#FFD400' });
    const all = r.draws.join(';');
    expect(all).toContain('drawbox='); // kicker
    expect(all).toContain('color=0xFFD400');
    expect(all).toContain('box=1:boxcolor=black@0.35'); // 標題底板
    const texts = r.draws.filter((d) => d.startsWith('drawtext='));
    expect(texts.length).toBeLessThanOrEqual(2); // 最多兩行
    expect(r.files.length).toBe(texts.length);
    clean(r);
  });
  it('短標題大字級、長標題自動縮（塞得進 1280 寬）', () => {
    const short = thumbnailDraws('C:/f.ttf', { title: '真相' });
    const long = thumbnailDraws('C:/f.ttf', { title: '一二三四五六七八' });
    const size = (r: { draws: string[] }) => parseInt((r.draws.find((d) => d.includes('fontsize=')) ?? '').match(/fontsize=(\d+)/)?.[1] ?? '0', 10);
    expect(size(short)).toBeGreaterThan(size(long));
    expect(size(long) * 8).toBeLessThanOrEqual(1280); // 8 字行塞得進畫面
    clean(short); clean(long);
  });
  it('非法 accent → 回退金', () => {
    const r = thumbnailDraws('C:/f.ttf', { title: 'x', accent: 'evil;drawbox' });
    expect(r.draws.join(';')).toContain('color=0xFFD400');
    clean(r);
  });
  it('標題位置 top<center<bottom（A/B 變體）', () => {
    const titleY = (pos: 'bottom' | 'top' | 'center') => {
      const r = thumbnailDraws('C:/f.ttf', { title: '真相', pos });
      const dt = r.draws.find((d) => d.startsWith('drawtext=')) ?? '';
      clean(r);
      return parseInt(dt.match(/:y=(\d+)/)?.[1] ?? '-1', 10);
    };
    const top = titleY('top'), center = titleY('center'), bottom = titleY('bottom');
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(center);
    expect(center).toBeLessThan(bottom);
  });
  it('省略 pos 與 pos=bottom 產生相同座標（零回歸）', () => {
    const a = thumbnailDraws('C:/f.ttf', { title: '真相測試' });
    const b = thumbnailDraws('C:/f.ttf', { title: '真相測試', pos: 'bottom' });
    const y = (r: { draws: string[] }) => (r.draws.find((d) => d.startsWith('drawtext=')) ?? '').match(/:y=(\d+)/)?.[1];
    expect(y(a)).toBe(y(b));
    clean(a); clean(b);
  });
  it('THUMBNAIL_VARIANTS：3 版、key 唯一、第一版沿用專案色（無 accent）', () => {
    expect(THUMBNAIL_VARIANTS).toHaveLength(3);
    expect(new Set(THUMBNAIL_VARIANTS.map((v) => v.key)).size).toBe(3);
    expect(THUMBNAIL_VARIANTS[0].accent).toBeUndefined();
    expect(THUMBNAIL_VARIANTS[0].titlePos).toBe('bottom');
    for (const v of THUMBNAIL_VARIANTS.slice(1)) expect(v.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('filmFinishFilter（電影感收尾）', () => {
  it('含膠片噪點 noise 與暗角 vignette；strong 比 subtle 顆粒更重、暗角更強', () => {
    const subtle = filmFinishFilter();
    const strong = filmFinishFilter({ intensity: 'strong' });
    expect(subtle).toContain('noise=alls=9');
    expect(subtle).toContain('vignette=PI/5');
    expect(strong).toContain('noise=alls=18');
    expect(strong).toContain('vignette=PI/4');
  });
});

describe('lowerThirdDraws（章節標題 lower-third）', () => {
  const clean = (r: { files: string[] }) => { for (const f of r.files) { try { unlinkSync(f); } catch { /* noop */ } } };
  it('accent 色條(drawbox 用 ih)＋深色底板標題(drawtext 用 h)、淡入淡出、寫暫存檔', () => {
    const r = lowerThirdDraws('C:/f.ttf', { text: '第一章 · 開場', accent: '#FFD400', holdSec: 2.6 }, 1280, 720);
    const all = r.draws.join(';');
    expect(all).toContain('drawbox='); // 品牌強調色條
    expect(all).toContain('color=0xFFD400');
    expect(all).toContain('ih*0.72'); // 色條用輸入高度
    expect(all).toContain('y=h*0.72'); // 標題用畫面高度
    expect(all).toContain('box=1'); // 深色底板
    expect(all).toContain('max(0'); // 淡出
    expect(all).toMatch(/x='\d+-\d+\*max\(0\\,1-t\/0\.3\)'/); // 由左滑入（drawtext x 逐幀）
    expect(r.files.length).toBe(1);
    clean(r);
  });
  it('非法 accent → 回退金', () => {
    const r = lowerThirdDraws('C:/f.ttf', { text: 'x', accent: 'evil;drawbox' }, 1280, 720);
    expect(r.draws.join(';')).toContain('color=0xFFD400');
    clean(r);
  });
});

describe('progressBarOverlay（進度條，overlay 滑入版）', () => {
  it('滿版色條 lavfi 輸入（片長+5s）＋ overlay x 由 -W 滑到 0、逐幀求值、底部 y=H-h', () => {
    const { input, overlay } = progressBarOverlay({ durationSec: 30, canvasW: 720, canvasH: 1280 });
    expect(input).toContain('color=c=#FFD400:s=720x8'); // 預設金、厚度 8（720p 基準）
    expect(input).toContain('d=35.00'); // 30+5
    expect(overlay).toContain("x='-720+720*min(1\\,t/30.00)'"); // 由左滑入
    expect(overlay).toContain('y=1272'); // 1280-8 底部
    expect(overlay).toContain('eval=frame'); // 逐幀（drawbox 幾何不逐幀，此為修 bug 關鍵）
  });
  it('頂部 y=0；自訂色', () => {
    const { input, overlay } = progressBarOverlay({ durationSec: 12, position: 'top', color: '#00FF00', canvasW: 720, canvasH: 1280 });
    expect(input).toContain('color=c=#00FF00');
    expect(overlay).toContain('y=0');
  });
  it('非法色 → 回退金', () => {
    expect(progressBarOverlay({ durationSec: 5, color: 'evil;x' }).input).toContain('#FFD400');
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

  it('不傳 capStyle：bottom 黃色 66、punchAt 彈出時間窗 + 由下彈入 pop', () => {
    const f = memeFilterOf('結果是這樣', 'bottom', 1.5);
    expect(f).toContain('fontcolor=yellow');
    expect(f).toContain('fontsize=66');
    expect(f).toContain("enable='gte(t\\,1.50)'");
    expect(f).toContain('max(0\\,1-(t-1.50)/0.14)'); // 爆點由下彈入
    expect(f).toContain("y='"); // 含逗號的 y 用引號保護
  });

  it('top（無 punchAt）不做彈入動畫（靜態）', () => {
    const f = memeFilterOf('人到中年', 'top');
    expect(f).not.toContain('max(0\\,1-');
    expect(f).not.toContain("y='"); // 靜態 y 不加引號
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
