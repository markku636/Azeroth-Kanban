import { describe, it, expect } from 'vitest';
import { orientationForAspect, pexelsSearchUrl, pickPhotoSrc, stockQueryFromShot } from './stock';

describe('orientationForAspect', () => {
  it('9:16→portrait、16:9→landscape、1:1→square、未知→portrait', () => {
    expect(orientationForAspect('9:16')).toBe('portrait');
    expect(orientationForAspect('16:9')).toBe('landscape');
    expect(orientationForAspect('1:1')).toBe('square');
    expect(orientationForAspect('weird')).toBe('portrait');
  });
});

describe('pexelsSearchUrl', () => {
  it('帶 query/orientation/size/per_page（per_page 夾 1–80）', () => {
    const url = pexelsSearchUrl('city night', { orientation: 'portrait', perPage: 999 });
    expect(url).toContain('https://api.pexels.com/v1/search?');
    expect(url).toContain('query=city+night');
    expect(url).toContain('orientation=portrait');
    expect(url).toContain('size=large');
    expect(url).toContain('per_page=80');
  });
  it('無 orientation 時不帶該參數', () => {
    expect(pexelsSearchUrl('dog')).not.toContain('orientation=');
  });
});

describe('pickPhotoSrc', () => {
  const resp = {
    photos: [
      { id: 1, width: 1, height: 1, src: { portrait: 'P1', landscape: 'L1', large2x: 'X1', original: 'O1' } },
      { id: 2, width: 1, height: 1, src: { large2x: 'X2', original: 'O2' } },
    ],
  };
  it('portrait 優先用 portrait 版', () => {
    expect(pickPhotoSrc(resp, { orientation: 'portrait' })).toBe('P1');
  });
  it('landscape 優先用 landscape 版', () => {
    expect(pickPhotoSrc(resp, { orientation: 'landscape' })).toBe('L1');
  });
  it('無對應版本 → 退 large2x/original；idx 可換張（避免整片同圖）', () => {
    expect(pickPhotoSrc(resp, { orientation: 'portrait', idx: 1 })).toBe('X2'); // 第 2 張無 portrait → large2x
  });
  it('空結果 → null', () => {
    expect(pickPhotoSrc({ photos: [] })).toBeNull();
    expect(pickPhotoSrc(null)).toBeNull();
  });
});

describe('stockQueryFromShot', () => {
  it('去 SDXL 修飾詞/停用詞、去重、取前幾個名詞', () => {
    const q = stockQueryFromShot({ visual: 'a highly detailed cinematic photo of a busy Tokyo street at night, 8k, bokeh' });
    // 只留主體字：busy tokyo street night（去 a/highly/detailed/cinematic/photo/of/8k/bokeh）
    expect(q).toContain('tokyo');
    expect(q).toContain('street');
    expect(q).not.toContain('cinematic');
    expect(q).not.toContain('8k');
    expect(q.split(' ').length).toBeLessThanOrEqual(4);
  });
  it('空 visual → 空字串', () => {
    expect(stockQueryFromShot({ visual: '' })).toBe('');
    expect(stockQueryFromShot({})).toBe('');
  });
});
