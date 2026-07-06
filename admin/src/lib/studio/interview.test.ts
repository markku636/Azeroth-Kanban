import { describe, it, expect, vi, beforeEach } from 'vitest';

// interview.ts import './llm'（會拉進 LLM client）；parseShotArray 純函式，不需要 llm，故 stub 掉。
vi.mock('./llm', () => ({ complete: vi.fn() }));

import { parseShotArray, chatStoryboard, stripTrailingCommas, coercePlannedShots, adaptStoryboardFromSource, parseShotObject, rewriteShot } from './interview';
import { complete } from './llm';

describe('parseShotArray', () => {
  it('沒有 JSON 陣列時回傳空陣列', () => {
    expect(parseShotArray('抱歉，我需要更多資訊')).toEqual([]);
  });

  it('容忍 LLM 常見的尾逗號（陣列/物件末端多逗號），不會整份失敗', () => {
    // Gemini 常回這種：物件與陣列末端多一個逗號 → 舊版 JSON.parse 會爆 → 回空陣列 → 生成靜默失敗
    const text = '[{"visual":"a","tts":"一",},{"visual":"b","tts":"二"},]';
    const shots = parseShotArray(text);
    expect(shots).toHaveLength(2);
    expect(shots[0]).toMatchObject({ visual: 'a', tts: '一' });
    expect(shots[1]).toMatchObject({ visual: 'b', tts: '二' });
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

  it('stripTrailingCommas：只去結構性尾逗號、不動字串內的逗號', () => {
    expect(stripTrailingCommas('[1,2,]')).toBe('[1,2]');
    expect(stripTrailingCommas('{"a":1,}')).toBe('{"a":1}');
    expect(stripTrailingCommas('[{"a":1,},]')).toBe('[{"a":1}]');
    // 字串內、以及正常逗號不受影響
    expect(stripTrailingCommas('["a, b","c"]')).toBe('["a, b","c"]');
    expect(stripTrailingCommas('{"k":"x","j":"y"}')).toBe('{"k":"x","j":"y"}');
  });

  it('保留合法 sfx 與 punch 數值欄位', () => {
    const shots = parseShotArray('[{"sfx":"vineboom","punch":true,"punchAtFrac":0.5,"punchZoom":1.8}]');
    expect(shots[0]).toMatchObject({ sfx: 'vineboom', punch: true, punchAtFrac: 0.5, punchZoom: 1.8 });
  });

  it('punch 為字串 "false" → false（Boolean("false")===true 的陷阱，不誤觸發變焦）', () => {
    expect(parseShotArray('[{"visual":"x","punch":"false"}]')[0].punch).toBe(false);
    expect(parseShotArray('[{"visual":"x","punch":"true"}]')[0].punch).toBe(true);
    expect(parseShotArray('[{"visual":"x","punch":true}]')[0].punch).toBe(true);
    expect(parseShotArray('[{"visual":"x"}]')[0].punch).toBe(false);
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

  it('輸出被截斷（命中 maxTokens）→ 救回前面完整的分鏡，而非整批全丟', () => {
    // 第 3 個物件在中途被切斷、沒有結尾 ] → 舊版 regex 抓不到、整批回空
    const truncated = '[{"visual":"a","tts":"一"},{"visual":"b","tts":"二"},{"visual":"c","tts":"三';
    const shots = parseShotArray(truncated);
    expect(shots).toHaveLength(2);
    expect(shots.map((s) => s.visual)).toEqual(['a', 'b']);
  });
});

describe('coercePlannedShots（前端審核後的分鏡陣列 → 正規化落庫）', () => {
  it('正規化欄位、補預設（同 normalizeShot）', () => {
    const out = coercePlannedShots([{ visual: 'a cat', tts: '喵', branch: 'i2v' }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ visual: 'a cat', tts: '喵', branch: 'i2v', sfx: 'none', punch: false });
  });
  it('濾掉完全空白（無 visual 也無 tts）的鏡', () => {
    const out = coercePlannedShots([{ visual: 'x' }, { visual: '  ', tts: '' }, { tts: '有旁白' }, {}]);
    expect(out.map((s) => s.visual || s.tts)).toEqual(['x', '有旁白']);
  });
  it('未知/惡意 sfx、branch 一律退回安全預設', () => {
    const out = coercePlannedShots([{ visual: 'x', sfx: 'airhorn', branch: 'hologram' }]);
    expect(out[0]).toMatchObject({ sfx: 'none', branch: 'still' });
  });
  it('非陣列 → 空陣列', () => {
    expect(coercePlannedShots(null as unknown as unknown[])).toEqual([]);
    expect(coercePlannedShots('x' as unknown as unknown[])).toEqual([]);
  });
});

describe('parseShotObject（單一分鏡物件）', () => {
  it('合法物件 → 正規化分鏡', () => {
    const s = parseShotObject('好的：{"visual":"a cat","tts":"喵","branch":"i2v"} 以上');
    expect(s).toMatchObject({ visual: 'a cat', tts: '喵', branch: 'i2v' });
  });
  it('空白物件（無 visual 也無 tts）→ null', () => {
    expect(parseShotObject('{"caption":"  "}')).toBeNull();
  });
  it('沒有物件 → null', () => { expect(parseShotObject('抱歉沒有內容')).toBeNull(); });
});

describe('rewriteShot（逐鏡換一個）', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beforeEach(() => vi.mocked(complete as any).mockReset());
  const current = { visual: 'old', tts: '舊旁白', motion: '', emotion: '', branch: 'still' as const };

  it('回傳重寫後的分鏡', async () => {
    vi.mocked(complete as any).mockResolvedValue('{"visual":"new scene","tts":"新旁白更有梗"}');
    const s = await rewriteShot({ current, prevTts: '前句', nextTts: '後句' });
    expect(s).toMatchObject({ visual: 'new scene', tts: '新旁白更有梗' });
  });
  it('前後鏡旁白會帶進提示（承接脈絡）', async () => {
    vi.mocked(complete as any).mockResolvedValue('{"visual":"x","tts":"y"}');
    await rewriteShot({ current, prevTts: '上一句話', nextTts: '下一句話' });
    const content = vi.mocked(complete as any).mock.calls[0][0].messages[0].content;
    expect(content).toContain('上一句話');
    expect(content).toContain('下一句話');
  });
  it('AI 回不出有效物件 → null', async () => {
    vi.mocked(complete as any).mockResolvedValue('抱歉');
    expect(await rewriteShot({ current })).toBeNull();
  });
  it('維持使用者選定的 branch（i2v 時要求給 motion）', async () => {
    vi.mocked(complete as any).mockResolvedValue('{"visual":"x","tts":"y"}');
    await rewriteShot({ current: { ...current, branch: 'i2v' } });
    const content = vi.mocked(complete as any).mock.calls[0][0].messages[0].content;
    expect(content).toContain('branch 為 "i2v"');
    expect(content).toContain('motion');
  });
});

describe('adaptStoryboardFromSource（YouTube 分批改編）', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beforeEach(() => vi.mocked(complete as any).mockReset());
  const arr = (n: number, tag: string) =>
    JSON.stringify(Array.from({ length: n }, (_, i) => ({ visual: `${tag}v${i}`, tts: `旁白${tag}${i}` })));

  it('鏡數 ≤ 12 → 單次 LLM 呼叫', async () => {
    vi.mocked(complete as any).mockResolvedValue(arr(8, 'a'));
    const shots = await adaptStoryboardFromSource('大家好。今天要挑戰。'.repeat(5), 8);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(shots).toHaveLength(8);
    expect(shots[0].visual).toBe('av0');
  });

  it('鏡數 > 12 → 分批（20 鏡＝3 批 7/7/6）、保序串接、總數守恆', async () => {
    let call = 0;
    vi.mocked(complete as any).mockImplementation(async () => arr([7, 7, 6][call++], `b${call}`));
    const shots = await adaptStoryboardFromSource('句子。'.repeat(400), 20);
    expect(complete).toHaveBeenCalledTimes(3);
    expect(shots).toHaveLength(20);
    // 保序：第 1 批在前、最後一批在末
    expect(shots[0].visual).toBe('b1v0');
    expect(shots[shots.length - 1].visual).toBe('b3v5');
  });

  it('把上一批最後的旁白帶進下一批的提示（承接脈絡）', async () => {
    let call = 0;
    vi.mocked(complete as any).mockImplementation(async () => arr([7, 7, 6][call++], 'c'));
    await adaptStoryboardFromSource('句子。'.repeat(400), 20);
    // 第 2 次呼叫的 user 內容應包含第 1 批的結尾旁白（cN 尾兩句）
    const secondCallArg = vi.mocked(complete as any).mock.calls[1][0];
    expect(secondCallArg.messages[0].content).toContain('旁白c6');
  });

  it('極短來源＋高鏡數：空切片的批次跳過，不把整段重餵造成重複', async () => {
    const short = 'x'.repeat(99) + '。'; // 100 字、唯一句界在最後 → 尾段切片為空
    let call = 0;
    vi.mocked(complete as any).mockImplementation(async () => arr(7, `b${++call}`));
    const shots = await adaptStoryboardFromSource(short, 13); // 2 批 [7,6]，尾批切片空→跳過
    expect(complete).toHaveBeenCalledTimes(1); // 只有拿到內容的那批被呼叫（沒有重餵整段）
    expect(shots.length).toBeGreaterThan(0);
  });

  it('某批空輸出/壞 JSON → 自動重試一次後成功', async () => {
    let call = 0;
    vi.mocked(complete as any).mockImplementation(async () => {
      call++;
      if (call === 1) return '抱歉我需要更多資訊'; // 無 JSON 陣列 → parse 空
      return arr(8, 'd');
    });
    const shots = await adaptStoryboardFromSource('大家好。'.repeat(5), 8);
    expect(complete).toHaveBeenCalledTimes(2); // 重試了
    expect(shots).toHaveLength(8);
  });

  it('風格傾向 styleHint 會帶進改編提示（可把來源抄成不同調性）', async () => {
    vi.mocked(complete as any).mockResolvedValue(arr(6, 'st'));
    await adaptStoryboardFromSource('大家好。今天開箱。'.repeat(3), 6, undefined, '改編成迷因吐槽搞笑風格');
    const content = vi.mocked(complete as any).mock.calls[0][0].messages[0].content;
    expect(content).toContain('風格指定');
    expect(content).toContain('迷因吐槽');
  });
  it('沒給 styleHint → 提示不含風格指定（沿用來源）', async () => {
    vi.mocked(complete as any).mockResolvedValue(arr(6, 'ns'));
    await adaptStoryboardFromSource('大家好。', 6);
    expect(vi.mocked(complete as any).mock.calls[0][0].messages[0].content).not.toContain('風格指定');
  });

  it('maxTokens 隨鏡數放寬（避免長批 JSON 被 4096 預設截斷）', async () => {
    vi.mocked(complete as any).mockResolvedValue(arr(12, 'e'));
    await adaptStoryboardFromSource('大家好。', 12); // 12 鏡＝單次路徑：700+12*320=4540
    const arg = vi.mocked(complete as any).mock.calls[0][0];
    expect(arg.maxTokens).toBeGreaterThan(4096);
  });

  it('某批整批拋錯（如 429）→ 保留其他批的分鏡（部分成功不作廢）', async () => {
    let call = 0;
    vi.mocked(complete as any).mockImplementation(async () => {
      call++;
      if (call === 2) throw new Error('429 rate limited'); // 第 2 批整批失敗
      return arr([7, 7, 6][call - 1], 'f');
    });
    const shots = await adaptStoryboardFromSource('句子。'.repeat(400), 20);
    expect(complete).toHaveBeenCalledTimes(3); // 拋錯的批不重試（只有空輸出才重試）
    expect(shots).toHaveLength(13); // 7 + (跳過) + 6
  });

  // 註：「所有批都失敗 → rethrow lastErr」的行為由程式碼審查與 route 的 try/catch 保證；
  // vitest 對「rejection 從 mock 一路傳播出待測函式」會誤報 unhandled，故不在此單元測試（上面
  // 的「部分成功」測試已驗證批次迴圈的 try/catch，那條 rejection 在函式內部被消化）。
});

describe('chatStoryboard 狀態機', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beforeEach(() => vi.mocked(complete as any).mockReset());

  it('AI 仍在問問題（無 STORYBOARD）→ done:false + reply', async () => {
    vi.mocked(complete as any).mockResolvedValue('你想做哪種類型的短片？');
    const r = await chatStoryboard([{ role: 'user', content: '我想做影片' }]);
    expect(r).toEqual({ done: false, reply: '你想做哪種類型的短片？' });
  });

  it('輸出 STORYBOARD + 有效分鏡 → done:true + shots', async () => {
    vi.mocked(complete as any).mockResolvedValue('<STORYBOARD>[{"visual":"a","tts":"嗨"}]</STORYBOARD>');
    const r = await chatStoryboard([{ role: 'user', content: '好了' }]);
    expect(r.done).toBe(true);
    if (r.done) {
      expect(r.shots).toHaveLength(1);
      expect(r.shots[0].visual).toBe('a');
    }
  });

  it('STORYBOARD 但空陣列 → 視為未完成（done:false）', async () => {
    vi.mocked(complete as any).mockResolvedValue('<STORYBOARD>[]</STORYBOARD>');
    const r = await chatStoryboard([{ role: 'user', content: '好' }]);
    expect(r.done).toBe(false);
  });

  it('reply 去掉殘留的 STORYBOARD 標籤', async () => {
    vi.mocked(complete as any).mockResolvedValue('再給我一點細節 <STORYBOARD> 沒收尾');
    const r = await chatStoryboard([{ role: 'user', content: '?' }]);
    expect(r.done).toBe(false);
    if (!r.done) expect(r.reply).not.toContain('STORYBOARD');
  });
});
