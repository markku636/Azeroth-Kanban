import { describe, it, expect, vi } from 'vitest';

// proposals.ts 靜態 import prisma + studio-service（會初始化 DB client）；
// parseProposals 本身是純函式，故把那兩個模組 stub 掉，讓測試不連 DB。
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/studio-service', () => ({}));

import { parseProposals } from './proposals';

describe('parseProposals', () => {
  it('沒有 <PROPOSALS> 區塊時回傳空 proposals 與原文', () => {
    const r = parseProposals('好的，我幫你看看。');
    expect(r.proposals).toEqual([]);
    expect(r.reply).toBe('好的，我幫你看看。');
  });

  it('抽出 proposals 並把 <PROPOSALS> 區塊從 reply 移除', () => {
    const text = '這是我的建議。\n<PROPOSALS>[{"kind":"create_scene","summary":"開場","title":"早晨"}]</PROPOSALS>';
    const r = parseProposals(text);
    expect(r.reply).toBe('這是我的建議。');
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]).toMatchObject({ kind: 'create_scene', title: '早晨' });
  });

  it('丟棄未知 kind 與缺必要 id 的提案', () => {
    const text = '<PROPOSALS>[{"kind":"frobnicate","summary":"x"},{"kind":"update_shot","summary":"無 id"}]</PROPOSALS>';
    const r = parseProposals(text);
    expect(r.proposals).toEqual([]);
  });

  it('update_shot 有 shotId 時保留', () => {
    const text = '<PROPOSALS>[{"kind":"update_shot","summary":"改旁白","shotId":"abc","tts":"新台詞"}]</PROPOSALS>';
    const r = parseProposals(text);
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]).toMatchObject({ kind: 'update_shot', shotId: 'abc', tts: '新台詞' });
  });

  it('JSON 壞掉時不丟例外、回傳空 proposals', () => {
    const text = '<PROPOSALS>[not json]</PROPOSALS>';
    const r = parseProposals(text);
    expect(r.proposals).toEqual([]);
  });

  it('set_story_bible 只保留白名單內的字串欄位', () => {
    const text = '<PROPOSALS>[{"kind":"set_story_bible","summary":"設定","fields":{"premise":"前提","bogus":123}}]</PROPOSALS>';
    const r = parseProposals(text);
    expect(r.proposals).toHaveLength(1);
    const p = r.proposals[0] as { kind: string; fields: Record<string, string> };
    expect(p.fields).toEqual({ premise: '前提' });
  });

  it('create_shot 的 sceneId 可為 null（散鏡）', () => {
    const text = '<PROPOSALS>[{"kind":"create_shot","summary":"散鏡","sceneId":null,"visual":"a wide shot"}]</PROPOSALS>';
    const r = parseProposals(text);
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0]).toMatchObject({ kind: 'create_shot', sceneId: null, visual: 'a wide shot' });
  });
});
