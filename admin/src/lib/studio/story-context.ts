import { prisma } from '@/lib/prisma';

/**
 * 故事聖經脈絡：注入到每一次 studio LLM 呼叫（腳本→場景→分鏡→補完），讓所有產出與設定一致。
 * - system：附加到 system prompt 末端的最高指導原則。
 * - preamble：放在第一則 user 訊息前的 <故事聖經> 區塊。
 * 欄位皆空時回傳空字串 → 行為與舊專案完全相同（向後相容）。
 */
export interface StoryContext {
  system: string;
  preamble: string;
}

const EMPTY: StoryContext = { system: '', preamble: '' };

export async function buildStoryContext(projectId: string): Promise<StoryContext> {
  let project;
  try {
    project = await prisma.studioProject.findUnique({
      where: { id: projectId },
      select: {
        title: true, description: true, logline: true, premise: true, worldSetting: true,
        styleGuide: true, tone: true, genre: true, targetAudience: true, bibleNotes: true,
        projectCharacters: {
          orderBy: { sortOrder: 'asc' },
          select: {
            roleInStory: true,
            character: { select: { name: true, persona: true, appearance: true, voiceInstruct: true } },
          },
        },
      },
    });
  } catch {
    return EMPTY;
  }
  if (!project) return EMPTY;

  const lines: string[] = [];
  const push = (label: string, val?: string | null) => { if (val && val.trim()) lines.push(`${label}：${val.trim()}`); };
  push('題材', project.description);
  push('前提(logline)', project.logline);
  push('核心前提', project.premise);
  push('世界觀／背景', project.worldSetting);
  push('類型', project.genre);
  push('語氣／調性', project.tone);
  push('風格指南', project.styleGuide);
  push('目標觀眾', project.targetAudience);
  push('補充', project.bibleNotes);

  const chars = project.projectCharacters
    .map((pc) => {
      const c = pc.character;
      const bits = [
        pc.roleInStory ? `（${pc.roleInStory}）` : '',
        c.persona ? `個性：${c.persona.trim()}` : '',
        c.appearance ? `外觀：${c.appearance.trim()}` : '',
        c.voiceInstruct ? `語氣：${c.voiceInstruct.trim()}` : '',
      ].filter(Boolean).join('；');
      return `- ${c.name}${bits ? ' ' + bits : ''}`;
    });

  if (lines.length === 0 && chars.length === 0) return EMPTY;

  const parts: string[] = ['<故事聖經>'];
  if (lines.length) parts.push(...lines);
  if (chars.length) { parts.push('登場角色：', ...chars); }
  parts.push('</故事聖經>');

  return {
    system: '請嚴格依下方〈故事聖經〉作為最高指導原則，所有輸出（畫面 visual、台詞 tts、角色、語氣 emotion）都必須與其設定、世界觀、風格一致。',
    preamble: parts.join('\n'),
  };
}
