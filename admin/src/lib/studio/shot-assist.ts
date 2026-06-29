import { prisma } from '@/lib/prisma';
import { complete } from './llm';
import { buildStoryContext } from './story-context';
import { SHOT_FIELDS, parseShotArray, type PlannedShot } from './interview';

// 「新增分鏡協助」：依專案脈絡 + 該場已有分鏡 + 使用者想法，產生延續風格的新分鏡。
// 與訪談共用同一份欄位規格(SHOT_FIELDS)與解析器(parseShotArray)。provider 由 LLM_PROVIDER 決定，
// 設 LLM_PROVIDER=vertex 即走 Gemini Vertex（使用者指定）。

const ASSIST_SYSTEM = `你是專業 AI 短片分鏡導演，擅長各種風格，特別擅長迷因吐槽喜劇。請依使用者既有的專案與分鏡脈絡，產生延續其風格、故事連貫的新分鏡。
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
    lines.push('', '目前已有的分鏡（依序，請延續其角色、風格與故事）：');
    for (const s of existing) {
      const desc = (s.caption || s.visual || s.tts || '').toString().trim().slice(0, 120);
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
