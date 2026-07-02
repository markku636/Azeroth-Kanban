import type { StudioActor, StudioOpOptions } from '@/lib/studio-service';
import { ApiReturnCode } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import {
  updateStoryBible, createScene, updateScene, createShot, updateShot,
  attachCharacterToProject, assignCharacterToShot,
} from '@/lib/studio-service';
import { tolerantJsonParse } from '../json-tolerant';

// 主動 AI Agent 的「提案」（write）型別。Agent 只提案、不直接落庫；使用者審核後才 apply。
export type Proposal =
  | { kind: 'set_story_bible'; summary: string; fields: Record<string, string> }
  | { kind: 'create_scene'; summary: string; title: string; synopsis?: string; dialogue?: string }
  | { kind: 'update_scene'; summary: string; sceneId: string; title?: string; synopsis?: string; dialogue?: string }
  | { kind: 'create_shot'; summary: string; sceneId?: string | null; visual?: string; tts?: string; motion?: string; emotion?: string; branch?: string; caption?: string; punchline?: string; sfx?: string; punch?: boolean }
  | { kind: 'update_shot'; summary: string; shotId: string; visual?: string; tts?: string; motion?: string; emotion?: string; branch?: string; caption?: string; punchline?: string; sfx?: string; punch?: boolean }
  | { kind: 'assign_character_to_shot'; summary: string; shotId: string; characterId: string | null }
  | { kind: 'attach_character'; summary: string; characterId: string; roleInStory?: string };

const KINDS = new Set([
  'set_story_bible', 'create_scene', 'update_scene', 'create_shot', 'update_shot', 'assign_character_to_shot', 'attach_character',
]);

/** Agent 輸出的提案規格（注入 system prompt，讓模型用此格式回提案）。 */
export const PROPOSAL_SPEC = `當你要建立或修改專案資料時，**不要假裝已完成**，而是輸出「提案」讓使用者審核。
在你的回覆「最後」附上一段 <PROPOSALS>...</PROPOSALS>，中間放一個 JSON 陣列；陣列外/標籤外照常用繁體中文說明你的想法。
每個提案物件含 "kind" 與 "summary"（繁中一句話說明這筆改動），以及該 kind 的欄位：
- {"kind":"set_story_bible","summary":"...","fields":{"premise":"...","worldSetting":"...","tone":"...","styleGuide":"...","genre":"...","targetAudience":"...","bibleNotes":"...","logline":"..."}}（只放要改的欄位）
- {"kind":"create_scene","summary":"...","title":"場景標題","synopsis":"這場演什麼","dialogue":"台詞草稿(可省)"}
- {"kind":"update_scene","summary":"...","sceneId":"<現有場景id>","title":"...","synopsis":"...","dialogue":"..."}（只放要改的欄位）
- {"kind":"create_shot","summary":"...","sceneId":"<場景id或null>","visual":"英文SDXL畫面","tts":"繁中旁白","motion":"英文運鏡","emotion":"繁中語氣","branch":"still|i2v|lip","caption":"大字幕(可省)","punchline":"反轉字幕(可省)","sfx":"none|vineboom|scratch|rimshot|ding|whoosh|boing","punch":false}
- {"kind":"update_shot","summary":"...","shotId":"<現有分鏡id>", 其餘同 create_shot 的可改欄位}
- {"kind":"assign_character_to_shot","summary":"...","shotId":"<分鏡id>","characterId":"<角色id或null>"}
- {"kind":"attach_character","summary":"...","characterId":"<角色庫角色id>","roleInStory":"主角(可省)"}
建立/修改分鏡的 **visual 撰寫規則**（與分鏡導演同標準）：① 精煉英文 SDXL（約 25–35 字詞）；② 有固定主角時每鏡都用同一組外觀錨點＋1–2 個獨特識別特徵（招牌配件/髮型/服裝優先，痣/疤只在角色真有時才寫）＝人物一致；③ 全片用同一組畫風結尾詞（畫風＋色調）＝畫風一致；④ **不要要求畫面內出現可讀文字/招牌字**（SDXL 會亂碼）——招牌只描述顏色/發光/風格，文案放 caption/punchline；⑤ caption/punchline 要短（≤14 字，滿版大字才放得下）。
規則：sceneId/shotId/characterId 一律用下方〈專案現況〉提供的真實 id；沒有要改資料時就不要放 <PROPOSALS> 區塊。產出必須與〈故事聖經〉一致。`;

function pick<T extends Record<string, unknown>>(o: T, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) if (typeof o[k] === 'string' && (o[k] as string).trim()) out[k] = (o[k] as string).trim();
  return out;
}

/** 從模型回覆抽出 <PROPOSALS> JSON 陣列並正規化。 */
export function parseProposals(text: string): { reply: string; proposals: Proposal[] } {
  const m = text.match(/<PROPOSALS>([\s\S]*?)<\/PROPOSALS>/);
  const reply = text.replace(/<PROPOSALS>[\s\S]*?<\/PROPOSALS>/, '').trim();
  if (!m) return { reply: text.trim(), proposals: [] };
  let raw: unknown;
  try { const j = m[1].match(/\[[\s\S]*\]/); raw = tolerantJsonParse(j ? j[0] : '[]'); } catch { return { reply, proposals: [] }; }
  if (!Array.isArray(raw)) return { reply, proposals: [] };
  const proposals: Proposal[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const kind = String(o.kind ?? '');
    if (!KINDS.has(kind)) continue;
    const summary = String(o.summary ?? kind);
    const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined);
    const b = (k: string) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : undefined);
    if (kind === 'set_story_bible') {
      const fields = pick((o.fields as Record<string, unknown>) ?? {}, ['premise', 'worldSetting', 'styleGuide', 'tone', 'genre', 'targetAudience', 'bibleNotes', 'logline', 'description']);
      if (Object.keys(fields).length) proposals.push({ kind, summary, fields });
    } else if (kind === 'create_scene') {
      if (s('title')) proposals.push({ kind, summary, title: s('title')!, synopsis: s('synopsis'), dialogue: s('dialogue') });
    } else if (kind === 'update_scene') {
      if (s('sceneId')) proposals.push({ kind, summary, sceneId: s('sceneId')!, title: s('title'), synopsis: s('synopsis'), dialogue: s('dialogue') });
    } else if (kind === 'create_shot') {
      proposals.push({ kind, summary, sceneId: o.sceneId === null ? null : s('sceneId'), visual: s('visual'), tts: s('tts'), motion: s('motion'), emotion: s('emotion'), branch: s('branch'), caption: s('caption'), punchline: s('punchline'), sfx: s('sfx'), punch: b('punch') });
    } else if (kind === 'update_shot') {
      if (s('shotId')) proposals.push({ kind, summary, shotId: s('shotId')!, visual: s('visual'), tts: s('tts'), motion: s('motion'), emotion: s('emotion'), branch: s('branch'), caption: s('caption'), punchline: s('punchline'), sfx: s('sfx'), punch: b('punch') });
    } else if (kind === 'assign_character_to_shot') {
      if (s('shotId')) proposals.push({ kind, summary, shotId: s('shotId')!, characterId: o.characterId === null ? null : (s('characterId') ?? null) });
    } else if (kind === 'attach_character') {
      if (s('characterId')) proposals.push({ kind, summary, characterId: s('characterId')!, roleInStory: s('roleInStory') });
    }
  }
  return { reply, proposals };
}

/** 套用使用者核可的提案（逐筆呼叫 studio-service）。回傳每筆結果。 */
export async function applyProposals(
  ownerId: string, projectId: string, proposals: Proposal[], actor: StudioActor, options: StudioOpOptions,
): Promise<{ applied: number; results: { summary: string; ok: boolean; message?: string }[] }> {
  const results: { summary: string; ok: boolean; message?: string }[] = [];
  for (const p of proposals) {
    try {
      let r: { code: number; message?: string } | null = null;
      if (p.kind === 'set_story_bible') {
        r = await updateStoryBible(ownerId, projectId, p.fields, actor, options);
      } else if (p.kind === 'create_scene') {
        r = await createScene(ownerId, projectId, { title: p.title, synopsis: p.synopsis, dialogue: p.dialogue }, actor, options);
      } else if (p.kind === 'update_scene') {
        // 把 sceneId 綁回 URL 專案：否則 admin(bypass)可改任意專案的場景、一般使用者可能誤改自己別的專案。
        // 明確檢查 sceneId 真值：Prisma 把 { id: undefined } 當「無此條件」會誤配到專案首筆（畸形 client 輸入防護）。
        r = (p.sceneId && (await prisma.scene.findFirst({ where: { id: p.sceneId, projectId }, select: { id: true } })))
          ? await updateScene(ownerId, p.sceneId, { title: p.title, synopsis: p.synopsis, dialogue: p.dialogue }, actor, options)
          : { code: ApiReturnCode.NOT_FOUND, message: '場景不屬於此專案' };
      } else if (p.kind === 'create_shot') {
        r = await createShot(ownerId, { projectId, sceneId: p.sceneId ?? null, visual: p.visual, tts: p.tts, motion: p.motion, emotion: p.emotion, branch: p.branch, caption: p.caption, punchline: p.punchline, sfx: p.sfx === 'none' ? undefined : p.sfx, punch: p.punch }, actor, options);
      } else if (p.kind === 'update_shot') {
        r = (p.shotId && (await prisma.shot.findFirst({ where: { id: p.shotId, projectId }, select: { id: true } })))
          ? await updateShot(ownerId, p.shotId, { visual: p.visual, tts: p.tts, motion: p.motion, emotion: p.emotion, branch: p.branch, caption: p.caption, punchline: p.punchline, sfx: p.sfx === 'none' ? undefined : p.sfx, punch: p.punch }, actor, options)
          : { code: ApiReturnCode.NOT_FOUND, message: '分鏡不屬於此專案' };
      } else if (p.kind === 'assign_character_to_shot') {
        r = (p.shotId && (await prisma.shot.findFirst({ where: { id: p.shotId, projectId }, select: { id: true } })))
          ? await assignCharacterToShot(ownerId, p.shotId, p.characterId, actor, options)
          : { code: ApiReturnCode.NOT_FOUND, message: '分鏡不屬於此專案' };
      } else if (p.kind === 'attach_character') {
        r = await attachCharacterToProject(ownerId, projectId, { characterId: p.characterId, roleInStory: p.roleInStory }, actor, options);
      }
      const ok = !!r && r.code === ApiReturnCode.SUCCESS;
      results.push({ summary: p.summary, ok, message: ok ? undefined : r?.message });
    } catch (e) {
      results.push({ summary: p.summary, ok: false, message: e instanceof Error ? e.message : '套用失敗' });
    }
  }
  return { applied: results.filter((x) => x.ok).length, results };
}
