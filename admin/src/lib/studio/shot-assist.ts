import { prisma } from '@/lib/prisma';
import { complete } from './llm';
import { buildStoryContext } from './story-context';
import { SHOT_FIELDS, parseShotArray, type PlannedShot } from './interview';

// 「新增分鏡協助」：依專案脈絡 + 該場已有分鏡 + 使用者想法，產生延續風格的新分鏡。
// 與訪談共用同一份欄位規格(SHOT_FIELDS)與解析器(parseShotArray)。provider 由 LLM_PROVIDER 決定，
// 設 LLM_PROVIDER=vertex 即走 Gemini Vertex（使用者指定）。

const ASSIST_SYSTEM = `你是專業 AI 短片分鏡導演，擅長各種風格，特別擅長能在 YouTube Shorts／抖音瘋傳的迷因吐槽喜劇。請依使用者既有的專案與分鏡脈絡，產生延續其風格、故事連貫的新分鏡。
延續用的節奏原則：每一鏡都要「推進或加碼」（別原地踏步）；喜劇用 setup→punchline 升級結構，一個比一個誇張、別重複同梗；旁白口語、有態度、短句（盡量 ≤15 字）；若已接近結尾，收在記得住的反轉或回扣。
${SHOT_FIELDS}
只回傳 JSON 陣列，不要任何其他文字或 markdown。`;

const MAX_CONTEXT_SHOTS = 24; // 餵給模型的既有分鏡上限（避免長專案塞爆 prompt）

export interface SuggestInput {
  /** 指定場景時取該場已有分鏡作脈絡；null = 取整個專案 */
  sceneId?: string | null;
  /** 使用者的一句想法／方向（可省略，省略時純依脈絡接續） */
  hint?: string;
  /** 要產生幾個分鏡（1 = 單鏡補完；>1 = 續寫多鏡） */
  count: number;
}

/** 產生建議分鏡（不落庫；落庫由路由層用 createShot 處理）。 */
export async function suggestShots(projectId: string, input: SuggestInput): Promise<PlannedShot[]> {
  const [project, story] = await Promise.all([
    prisma.studioProject.findUnique({ where: { id: projectId }, select: { title: true } }),
    buildStoryContext(projectId),
  ]);

  const existing = await prisma.shot.findMany({
    where: { projectId, ...(input.sceneId ? { sceneId: input.sceneId } : {}) },
    orderBy: { sortOrder: 'asc' },
    select: { shotNo: true, visual: true, tts: true, caption: true },
    take: MAX_CONTEXT_SHOTS,
  });

  const lines: string[] = [];
  if (story.preamble) lines.push(story.preamble, '');
  lines.push(`專案標題：「${project?.title ?? ''}」`);
  if (existing.length) {
    lines.push('', '目前已有的分鏡（依序，請延續其角色外觀錨點、畫風與故事）：');
    for (const s of existing) {
      // 以 visual 領頭：它帶著角色外觀錨點與畫風結尾詞，是「延續角色/風格」最關鍵的線索；
      // 再附一小段 caption/tts 交代劇情節拍（喜劇鏡有 caption 時原本會蓋掉 visual → 角色/畫風會飄）。
      const vis = (s.visual ?? '').toString().trim().slice(0, 110);
      const beat = (s.caption ?? s.tts ?? '').toString().trim().slice(0, 30);
      const desc = [vis, beat].filter(Boolean).join(' ／ ');
      lines.push(`#${s.shotNo} ${desc}`);
    }
  } else {
    lines.push('（目前尚無分鏡，這是開頭。）');
  }
  if (input.hint?.trim()) lines.push('', `使用者想法／方向：${input.hint.trim()}`);
  lines.push(
    '',
    input.count === 1
      ? '請產生「接下來這一鏡」，共 1 個分鏡，延續上述風格與故事；若有使用者想法，以其為主軸。'
      : `請續寫接下來的 ${input.count} 個分鏡，延續上述風格與故事。`,
  );

  const text = await complete({
    system: ASSIST_SYSTEM + (story.system ? `\n\n${story.system}` : ''),
    messages: [{ role: 'user', content: lines.join('\n') }],
  });
  return parseShotArray(text).slice(0, input.count);
}

// ── 單鏡「魔法棒」：用 AI 潤飾既有分鏡的某一欄（畫面英文 prompt／旁白／喜劇大字），回傳純文字不落庫。──
// 與角色魔法棒(character-assist)同調，但會帶入專案故事脈絡＋同鏡其他欄位以維持一致；provider 依 LLM_PROVIDER。

export type ShotPolishField = 'visual' | 'tts' | 'caption' | 'punchline';
export const SHOT_POLISH_FIELDS: readonly ShotPolishField[] = ['visual', 'tts', 'caption', 'punchline'];

const POLISH_SYS: Record<ShotPolishField, string> = {
  visual:
    'You are an expert SDXL prompt engineer for short-form video keyframes. Rewrite the shot VISUAL into a single clean ' +
    'English comma-separated prompt, ordered subject → action → setting → lighting → camera → style, leading with the subject and key light. ' +
    'Keep it concise (about 25–35 words, never exceed the SDXL CLIP 77-token limit) and cinematic. ' +
    'Preserve the original intent and any named characters. Output ONLY the prompt text — no markdown, no quotes, no labels.',
  tts:
    '你是短影音編劇。把這句旁白／台詞改寫得更口語、更有態度、更能在前 3 秒抓住觀眾。' +
    '保留原意，繁體中文，盡量 ≤15 字、像真人在講話。只輸出改寫後的那一句，不要 markdown、引號、標題或說明。',
  caption:
    '你是迷因吐槽短片的字幕編劇。把這句「大字幕（setup）」改寫得更精煉、更有畫面、能鋪陳反轉。' +
    '繁體中文、短而有力。只輸出該句，不要 markdown、引號或說明。',
  punchline:
    '你是迷因吐槽短片的字幕編劇。把這句「反轉爆點（punchline）」改寫得更出乎意料、更好笑、與 setup 形成反差。' +
    '繁體中文、短而有力。只輸出該句，不要 markdown、引號或說明。',
};

const POLISH_LABEL: Record<ShotPolishField, string> = { visual: '畫面', tts: '旁白', caption: '大字幕 setup', punchline: '反轉 punchline' };

export interface PolishInput {
  field: ShotPolishField;
  /** 目前欄位內容（可空，空時依脈絡為本鏡這欄生成）。 */
  text: string;
  /** 同鏡其他欄位（提升一致性）。 */
  visual?: string; tts?: string; caption?: string; punchline?: string;
}

const MAX_POLISH_INPUT = 2000;

function buildPolishUser(input: PolishInput, preamble: string): string {
  const ctx: string[] = [];
  if (preamble.trim()) ctx.push(preamble.trim());
  const others: [ShotPolishField, string | undefined][] = [['visual', input.visual], ['tts', input.tts], ['caption', input.caption], ['punchline', input.punchline]];
  for (const [f, v] of others) if (f !== input.field && v?.trim()) ctx.push(`本鏡${POLISH_LABEL[f]}：${v.trim().slice(0, 300)}`);
  const cur = input.text.trim().slice(0, MAX_POLISH_INPUT);
  ctx.push(cur ? `目前的${POLISH_LABEL[input.field]}（請潤飾／改寫）：\n${cur}` : `目前的${POLISH_LABEL[input.field]}為空，請依上述脈絡為本鏡這一欄產生合理內容。`);
  return ctx.join('\n');
}

function cleanPolish(out: string): string {
  let s = out.trim();
  s = s.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('「') && s.endsWith('」'))) s = s.slice(1, -1).trim();
  return s;
}

/** 用 AI 潤飾既有分鏡的單一欄位（provider 依 LLM_PROVIDER），回傳乾淨純文字（不落庫）。 */
export async function polishShotField(projectId: string, input: PolishInput): Promise<string> {
  const story = await buildStoryContext(projectId);
  const out = await complete({
    system: POLISH_SYS[input.field] + (story.system ? `\n\n${story.system}` : ''),
    messages: [{ role: 'user', content: buildPolishUser(input, story.preamble) }],
    temperature: input.field === 'visual' ? 0.6 : 0.85,
    // 思考型模型(2.5-flash/pro)會與輸出共用預算；放寬避免空輸出（同 character-assist）。
    maxTokens: 2048,
  });
  return cleanPolish(out);
}
