import { describe, it, expect, vi } from 'vitest';

// interview.ts import './llm'（會拉進 LLM client）；parseShotArray 純函式，不需要 llm，故 stub 掉。
vi.mock('./llm', () => ({ complete: vi.fn() }));

import { parseShotArray } from './interview';

describe('parseShotArray', () => {
  it('沒有 JSON 陣列時回傳空陣列', () => {
    expect(parseShotArray('抱歉，我需要更多資訊')).toEqual([]);
  });

  it('從含前後雜訊的文字中抽出陣列並正規化', () => {
    const text = '好的：\n[{"visual":"a cat","tts":"喵","motion":"pan","emotion":"開心","branch":"i2v"}]\n以上。';
    const shots = parseShotArray(text);
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ visual: 'a cat', tts: '喵', motion: 'pan', emotion: '開心', branch: 'i2v' });
  });

  it('缺欄位時補空字串、branch 預設 still、sfx 預設 none、punch 預設 false', () => {
    const shots = parseShotArray('[{"visual":"x"}]');
    expect(shots[0]).toMatchObject({ visual: 'x', tts: '', motion: '', emotion: '', branch: 'still', sfx: 'none', punch: false });
    expect(shots[0].caption).toBeUndefined();
    expect(shots[0].punchline).toBeUndefined();
  });

  it('未知 branch 退回 still、未知 sfx 退回 none', () => {
    const shots = parseShotArray('[{"branch":"hologram","sfx":"airhorn"}]');
    expect(shots[0].branch).toBe('still');
    expect(shots[0].sfx).toBe('none');
  });

  it('保留合法 sfx 與 punch 數值欄位', () => {
    const shots = parseShotArray('[{"sfx":"vineboom","punch":true,"punchAtFrac":0.5,"punchZoom":1.8}]');
    expect(shots[0]).toMatchObject({ sfx: 'vineboom', punch: true, punchAtFrac: 0.5, punchZoom: 1.8 });
  });

  it('空白 caption 視為未設定、非空 punchline 保留', () => {
    const shots = parseShotArray('[{"caption":"  ","punchline":"爆點"}]');
    expect(shots[0].caption).toBeUndefined();
    expect(shots[0].punchline).toBe('爆點');
  });

  it('punchAtFrac 非數字 → undefined', () => {
    const shots = parseShotArray('[{"punchAtFrac":"half"}]');
    expect(shots[0].punchAtFrac).toBeUndefined();
  });

  it('JSON 壞掉或找不到陣列 → 空陣列（不丟例外）', () => {
    expect(parseShotArray('[oops')).toEqual([]);
    expect(parseShotArray('完全沒有括號')).toEqual([]);
  });

  it('解析多個分鏡，保序', () => {
    const shots = parseShotArray('[{"visual":"a"},{"visual":"b"},{"visual":"c"}]');
    expect(shots.map((s) => s.visual)).toEqual(['a', 'b', 'c']);
  });
});
