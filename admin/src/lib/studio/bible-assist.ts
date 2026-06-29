import { prisma } from '@/lib/prisma';
import { complete } from './llm';

// 故事聖經單一欄位「魔法棒」：用 AI 潤飾／改寫某一欄，回傳純文字不落庫。
// 與整份「AI 生成設定」(bible/generate) 不同——這是**非破壞式**改一欄（不動其他已寫好的欄），
// 並帶入同專案其他欄位脈絡維持一致。provider 依 LLM_PROVIDER。

export type BibleField = 'premise' | 'logline' | 'worldSetting' | 'styleGuide' | 'bibleNotes';
export const BIBLE_POLISH_FIELDS: readonly BibleField[] = ['premise', 'logline', 'worldSetting', 'styleGuide', 'bibleNotes'];

const SYS: Record<BibleField, string> = {
  premise:
    '你是短片編劇。請把「核心前提（故事種子）」優化得更具體、有張力、可餵給 AI 往下生成：' +
    '點出主角是誰、想要什麼、最大的阻礙與反差。繁體中文、2–4 句。只輸出優化後的純文字，不要 markdown、引號、標題或說明。',
  logline:
    '你是短片編劇。把「logline（一句話前提）」改寫成一句像會在社群爆紅的影片標題——有看點／衝突／懸念。' +
    '繁體中文、一句話、精煉有力。只輸出該句，不要 markdown、引號或說明。',
  worldSetting:
    '你是世界觀設定編劇。把「世界觀／背景設定」優化得更立體：時代、地點、規則、氛圍，' +
    '寫成能讓 AI 維持一致背景的依據。繁體中文、2–4 句。只輸出純文字，不要 markdown、引號或說明。',
  styleGuide:
    '你是視覺與敘事風格指導。把「風格指南」優化成可直接套用的指南：鏡頭語言、色調、' +
    'SDXL 視覺風格關鍵字（例如 photorealistic, cinematic lighting, teal-orange grade）、敘事調性。' +
    '繁體中文敘述為主、視覺關鍵字可用英文。2–4 句。只輸出純文字，不要 markdown、引號或說明。',
  bibleNotes:
    '你是故事聖經維護者。把「補充設定」整理得更清楚好用（禁忌、catchphrase、品牌調性、重複母題…）。' +
    '繁體中文、條列或短句皆可，精煉。只輸出純文字，不要 markdown 標題或說明。',
};

const LABEL: Record<BibleField, string> = {
  premise: '核心前提', logline: 'Logline', worldSetting: '世界觀', styleGuide: '風格指南', bibleNotes: '補充設定',
};

const MAX_INPUT = 4000;

function clean(out: string): string {
  let s = out.trim();
  s = s.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('「') && s.endsWith('」'))) s = s.slice(1, -1).trim();
  return s;
}

/** 用 AI 潤飾故事聖經單一欄位（provider 依 LLM_PROVIDER），回傳乾淨純文字（不落庫）。 */
export async function polishBibleField(projectId: string, field: BibleField, text: string): Promise<string> {
  const p = await prisma.studioProject.findUnique({
    where: { id: projectId },
    select: { title: true, description: true, premise: true, logline: true, worldSetting: true, styleGuide: true, tone: true, genre: true, targetAudience: true, bibleNotes: true },
  });

  const ctx: string[] = [];
  if (p?.title) ctx.push(`專案標題：${p.title}`);
  // 帶入其他已填欄位作脈絡（排除正在優化的這欄）。
  const others: [string, string | null | undefined][] = [
    ['題材', p?.description], ['核心前提', field !== 'premise' ? p?.premise : undefined],
    ['Logline', field !== 'logline' ? p?.logline : undefined], ['世界觀', field !== 'worldSetting' ? p?.worldSetting : undefined],
    ['風格', field !== 'styleGuide' ? p?.styleGuide : undefined], ['語氣', p?.tone], ['類型', p?.genre], ['受眾', p?.targetAudience],
  ];
  for (const [k, v] of others) if (v && v.trim()) ctx.push(`${k}：${v.trim().slice(0, 400)}`);
  const cur = text.trim().slice(0, MAX_INPUT);
  ctx.push(cur ? `目前的${LABEL[field]}（請優化／改寫）：\n${cur}` : `目前的${LABEL[field]}為空，請依上述脈絡從零生成一份合理內容。`);

  const out = await complete({
    system: SYS[field],
    messages: [{ role: 'user', content: ctx.join('\n') }],
    temperature: 0.8,
    maxTokens: 2048, // 思考型模型與輸出共用預算，放寬避免空輸出
  });
  return clean(out);
}
