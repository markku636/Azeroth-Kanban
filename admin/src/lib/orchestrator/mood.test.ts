import { describe, it, expect } from 'vitest';
import { moodFromProject, moodFromToneGenre, moodFromEmotion, resolveBgmMood } from './mood';

describe('resolveBgmMood（覆寫 ＞ 預設 ＞ 自動；只採合法 key）', () => {
  it('合法 override 優先', () => { expect(resolveBgmMood('epic', 'horror', 'warm')).toBe('epic'); });
  it('override 非法/空 → 退 preset', () => {
    expect(resolveBgmMood('nope', 'horror', 'warm')).toBe('horror');
    expect(resolveBgmMood('', 'horror', 'warm')).toBe('horror');
    expect(resolveBgmMood(null, 'chill', 'warm')).toBe('chill');
  });
  it('override 與 preset 都無效 → 自動', () => {
    expect(resolveBgmMood(undefined, undefined, 'somber')).toBe('somber');
    expect(resolveBgmMood('bad', 'alsoBad', 'tense')).toBe('tense');
  });
  it('修正：dark-horror 的 preset horror 現在會被採用', () => {
    expect(resolveBgmMood(undefined, 'horror', 'tense')).toBe('horror');
  });
});

describe('moodFromToneGenre（tone/genre → 配樂情緒，與原版一致）', () => {
  it('喜劇/溫暖 → warm', () => { expect(moodFromToneGenre('喜劇 溫暖')).toBe('warm'); });
  it('恐怖/懸疑 → tense', () => { expect(moodFromToneGenre('horror 懸疑')).toBe('tense'); });
  it('催淚/悲傷 → somber', () => { expect(moodFromToneGenre('催淚 傷感')).toBe('somber'); });
  it('空/無關鍵字 → neutral', () => { expect(moodFromToneGenre('紀錄片 日常')).toBe('neutral'); });
});

describe('moodFromProject（tone/genre 明確用之＝零回歸；否則分鏡情緒多數決）', () => {
  it('tone/genre 明確 → 直接用（不看分鏡）＝零回歸', () => {
    // genre=喜劇 → warm，即使分鏡全是悲傷也不動（尊重作者設定）
    const shots = [{ emotion: '谷底' }, { emotion: '失落' }, { emotion: '催淚' }];
    expect(moodFromProject({ tone: '', genre: '喜劇' }, shots)).toBe('warm');
  });

  it('tone/genre 未填 → 用分鏡情緒多數決（原本一律 neutral）', () => {
    const shots = [{ emotion: '谷底' }, { emotion: '失落' }, { emotion: '不捨' }, { emotion: '好笑' }];
    // 3 somber vs 1 warm → somber
    expect(moodFromProject({ tone: null, genre: null }, shots)).toBe('somber');
  });

  it('tone/genre 未填 + 分鏡多為熱血/會心 → warm', () => {
    const shots = [{ emotion: '熱血' }, { emotion: '得意' }, { emotion: '會心一笑' }, { emotion: '尷尬' }];
    expect(moodFromProject({ tone: '', genre: '' }, shots)).toBe('warm');
  });

  it('tone/genre 未填 + 無分鏡情緒 → neutral（向後相容）', () => {
    expect(moodFromProject({ tone: '', genre: '' }, [])).toBe('neutral');
    expect(moodFromProject(null)).toBe('neutral');
  });
});

describe('moodFromEmotion（分鏡情緒詞涵蓋常見中文）', () => {
  it('谷底/失落 → somber', () => { expect(moodFromEmotion('谷底失落')).toBe('somber'); });
  it('熱血/感動 → warm', () => { expect(moodFromEmotion('熱血')).toBe('warm'); });
  it('緊張/驚 → tense', () => { expect(moodFromEmotion('緊張')).toBe('tense'); });
});
