import { describe, it, expect } from 'vitest';
import { STYLE_PRESETS, STYLE_PRESET_IDS, getStylePreset } from './style-preset';

describe('STYLE_PRESETS（影片風格模板）', () => {
  it('含 8 個模板，id 與 key 一致、都有中文 label', () => {
    expect(STYLE_PRESET_IDS).toEqual(['meme-comedy', 'dark-horror', 'clean-explainer', 'tech-review', 'vlog', 'news-brief', 'story-time', 'tutorial']);
    for (const id of STYLE_PRESET_IDS) {
      const p = STYLE_PRESETS[id];
      expect(p.id).toBe(id);
      expect(typeof p.label).toBe('string');
      expect(p.gradeStyle.length).toBeGreaterThan(0);
      expect(p.bgmMood.length).toBeGreaterThan(0);
    }
  });
  it('解說類模板綁定卡拉OK逐字高亮字幕＋片頭/CTA 卡片＋開關預設', () => {
    const clean = getStylePreset('clean-explainer')!;
    expect(clean.subStyle.segment).toBe(true);
    expect(clean.subStyle.highlight).toBe(true);
    expect(clean.cards?.outro).toBe(true);
    expect(clean.cards?.cta && clean.cards.cta.length).toBeGreaterThan(0);
    expect(clean.sceneTitles).toBe(true);
    expect(clean.autoSfx).toBe(true);
  });
  it('tech-review 綁定 cyber 調色 + 微電影感收尾；vlog 綁定 film 調色', () => {
    expect(getStylePreset('tech-review')!.gradeStyle).toBe('cyber');
    expect(getStylePreset('tech-review')!.filmFinish?.intensity).toBe('subtle');
    expect(getStylePreset('vlog')!.gradeStyle).toBe('film');
  });
  it('新增模板：news-brief 底板紅高亮、story-time 襯線黑色電影、tutorial 藍色高亮', () => {
    const news = getStylePreset('news-brief')!;
    expect(news.subStyle.plate).toBe(true);
    expect(news.subStyle.highlightColor).toBe('#FF4D4D');
    expect(getStylePreset('story-time')!.gradeStyle).toBe('noir');
    expect(getStylePreset('story-time')!.subStyle.fontKind).toBe('serif');
    expect(getStylePreset('tutorial')!.subStyle.highlightColor).toBe('#4DA6FF');
    expect(getStylePreset('tutorial')!.sceneTitles).toBe(true);
  });
  it('未知/空 → undefined（呼叫端 fallback）', () => {
    expect(getStylePreset('nope')).toBeUndefined();
    expect(getStylePreset(null)).toBeUndefined();
  });
});
