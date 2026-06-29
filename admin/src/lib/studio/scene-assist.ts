import { prisma } from '@/lib/prisma';
import { complete } from './llm';
import { buildStoryContext } from './story-context';

// 故事場景單一欄位「魔法棒」：潤飾 synopsis / dialogue（非破壞式、不落庫）。
// synopsis 是「展開為分鏡」的種子，潤飾它＝直接拉高下游分鏡品質。provider 依 LLM_PROVIDER。

export type SceneField = 'synopsis' | 'dialogue';
export const SCENE_POLISH_FIELDS: readonly SceneField[] = ['synopsis', 'dialogue'];

const SYS: Record<SceneField, string> = {
  synopsis:
    '你是短片編劇。把這一場的「劇情概要」優化得更具體、有戲劇張力、好展開成分鏡：' +
    '點出人物動作、轉折與這一場的目的，並承接整體故事。繁體中文、2–4 句。' +
    '只輸出純文字，不要 markdown、引號、標題或任何說明。',
  dialogue:
    '你是短片編劇。把這一場的「台詞／旁白草稿」潤飾得更口語、有態度、像真人在說話，符合角色與本場情境。' +
    '繁體中文。只輸出純文字，不要 markdown、引號或說明。',
};

const LABEL: Record<SceneField, string> = { synopsis: '劇情概要', dialogue: '台詞／旁白' };

function clean(out: string): string {
  let s = out.trim();
  s = s.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('「') && s.endsWith('」'))) s = s.slice(1, -1).trim();
  return s;
}

/** 用 AI 潤飾故事場景的單一欄位，回傳乾淨純文字（不落庫）。找不到場景回 null。 */
export async function polishSceneField(sceneId: string, field: SceneField, text: string): Promise<string | null> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId }, select: { projectId: true, title: true, synopsis: true, dialogue: true },
  });
  if (!scene) return null;
  const story = await buildStoryContext(scene.projectId);

  const ctx: string[] = [];
  if (story.preamble.trim()) ctx.push(story.preamble.trim());
  if (scene.title) ctx.push(`場景標題：${scene.title}`);
  if (field !== 'synopsis' && scene.synopsis?.trim()) ctx.push(`本場劇情概要：${scene.synopsis.trim().slice(0, 500)}`);
  const cur = text.trim().slice(0, 4000);
  ctx.push(cur ? `目前的${LABEL[field]}（請優化／改寫）：\n${cur}` : `目前的${LABEL[field]}為空，請依上述脈絡為本場這一欄生成合理內容。`);

  const out = await complete({
    system: SYS[field] + (story.system ? `\n\n${story.system}` : ''),
    messages: [{ role: 'user', content: ctx.join('\n') }],
    temperature: 0.85,
    maxTokens: 2048,
  });
  return clean(out);
}
