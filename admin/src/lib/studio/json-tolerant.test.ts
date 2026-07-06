import { describe, it, expect } from 'vitest';
import { stripTrailingCommas, tolerantJsonParse, salvageArrayObjects } from './json-tolerant';

describe('stripTrailingCommas', () => {
  it('去掉陣列/物件的結構性尾逗號', () => {
    expect(stripTrailingCommas('[1,2,]')).toBe('[1,2]');
    expect(stripTrailingCommas('{"a":1,}')).toBe('{"a":1}');
  });
  it('不動字串內的逗號', () => {
    expect(stripTrailingCommas('["a, b"]')).toBe('["a, b"]');
  });
});

describe('tolerantJsonParse', () => {
  it('合法 JSON 照常解析', () => {
    expect(tolerantJsonParse('[{"a":1}]')).toEqual([{ a: 1 }]);
  });
  it('容忍尾逗號', () => {
    expect(tolerantJsonParse('[{"a":1},]')).toEqual([{ a: 1 }]);
  });
});

describe('salvageArrayObjects（截斷陣列救回完整物件）', () => {
  it('完整陣列 → 原樣救回全部物件', () => {
    const parsed = JSON.parse(salvageArrayObjects('[{"a":1},{"b":2}]'));
    expect(parsed).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it('被截斷在最後一個物件中間 → 保住前面完整的物件', () => {
    const truncated = '[{"visual":"a","tts":"一"},{"visual":"b","tts":"二"},{"visual":"c","tts":'; // 第 3 個殘缺
    const parsed = JSON.parse(salvageArrayObjects(truncated));
    expect(parsed).toHaveLength(2);
    expect(parsed[1]).toMatchObject({ visual: 'b', tts: '二' });
  });
  it('物件內含巢狀陣列不影響救回', () => {
    const parsed = JSON.parse(salvageArrayObjects('[{"a":[1,2,3]},{"b":{"c":4}},{"d":'));
    expect(parsed).toHaveLength(2);
  });
  it('字串內的括號/跳脫引號不會誤判物件邊界', () => {
    const parsed = JSON.parse(salvageArrayObjects('[{"tts":"他說\\"好}]\\"啊"},{"tts":"下一句"'));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].tts).toContain('好}]');
  });
  it('前面有雜訊文字 → 從第一個 [ 開始救', () => {
    const parsed = JSON.parse(salvageArrayObjects('好的：\n[{"a":1},{"b":'));
    expect(parsed).toEqual([{ a: 1 }]);
  });
  it('完全沒有陣列 → []', () => {
    expect(salvageArrayObjects('完全沒有括號')).toBe('[]');
  });
  it('一個完整物件都沒有 → []', () => {
    expect(salvageArrayObjects('[{"a":')).toBe('[]');
  });
});
