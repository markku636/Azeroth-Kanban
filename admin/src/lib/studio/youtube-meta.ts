import { prisma } from '@/lib/prisma';
import { complete } from './llm';
import { buildStoryContext } from './story-context';

// 「YouTube 上架包裝」：把成片題材 + 分鏡內容，產出一份會被點開的社群上架文案
// （標題 / 縮圖大字 / 說明 / hashtags / 置頂留言）。不落庫，供前端複製貼上。
// provider 由 LLM_PROVIDER 決定（與訪談/分鏡協助同一條 LLM 路徑）。

export interface YouTubeMeta {
  title: string; // 吸睛標題
  thumbnailText: string; // 縮圖大字（3~6 字）
  description: string; // 影片說明（第 1 行=最強鉤子）
  hashtags: string[]; // 3~6 個
  pinnedComment: string; // 置頂留言（促互動）
}

const YT_SYSTEM = `你是 YouTube Shorts／抖音短影音的成長操盤手，專門替影片寫「會被滑到時點開」的標題與說明。
根據影片的題材與分鏡內容，產生一份能最大化點閱與互動的社群上架包裝。
原則：
- title：像爆款短影音標題——前段就要有鉤子／懸念／反差，口語、好奇心驅動，建議 ≤20 字；最多 1 個 emoji；不要爆雷結局。
- thumbnailText：縮圖上的超大字，3~6 字，挑最聳動的衝突點或反差。
- description：第 1 行就是最強鉤子（之後會被「顯示更多」收起），再 1~2 句簡介看點，結尾另起一行放 hashtags。
- hashtags：3~6 個、繁體中文為主，含明確主題標籤（如 #中年阿智 #寶可夢）。
- pinnedComment：一句能引發觀眾留言或分享的互動提問。
只回傳 JSON 物件（不要 markdown、不要多餘文字），格式：
{"title":"...","thumbnailText":"...","description":"...","hashtags":["#..."],"pinnedComment":"..."}`;

// 餵給模型的分鏡內容上限。超過時取「前 HEAD + 後 TAIL」鏡，讓描述同時涵蓋鉤子與結尾／CTA，
// 而不是只看前半段（否則長片的 description 會漏掉收尾，傷 YouTube 點閱與完播）。
const HEAD_SHOTS = 20;
const TAIL_SHOTS = 10;

function normalizeMeta(raw: Record<string, unknown>): YouTubeMeta {
  const s = (k: string) => String(raw[k] ?? '').trim();
  const tags = Array.isArray(raw.hashtags)
    ? raw.hashtags
        .map((t) => String(t).trim())
        .filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : `#${t}`))
        .slice(0, 8)
    : [];
  return {
    title: s('title'),
    thumbnailText: s('thumbnailText'),
    description: s('description'),
    hashtags: tags,
    pinnedComment: s('pinnedComment'),
  };
}

/** 依專案題材 + 分鏡內容，產生 YouTube 上架包裝（不落庫）。 */
export async function generateYouTubeMeta(projectId: string): Promise<YouTubeMeta> {
  const [project, story] = await Promise.all([
    prisma.studioProject.findUnique({
      where: { id: projectId },
      select: { title: true, premise: true, logline: true, tone: true, genre: true, targetAudience: true },
    }),
    buildStoryContext(projectId),
  ]);

  const shotSelect = { shotNo: true, tts: true, caption: true, punchline: true } as const;
  const total = await prisma.shot.count({ where: { projectId } });
  const elided = total > HEAD_SHOTS + TAIL_SHOTS;
  const shots = elided
    ? [
        ...(await prisma.shot.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' }, select: shotSelect, take: HEAD_SHOTS })),
        ...(await prisma.shot.findMany({ where: { projectId }, orderBy: { sortOrder: 'desc' }, select: shotSelect, take: TAIL_SHOTS })).reverse(),
      ]
    : await prisma.shot.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' }, select: shotSelect });

  const lines: string[] = [];
  if (story.preamble) lines.push(story.preamble, '');
  lines.push(`影片標題（內部）：「${project?.title ?? ''}」`);
  if (project?.logline) lines.push(`一句話前提：${project.logline}`);
  if (project?.premise) lines.push(`核心前提：${project.premise}`);
  if (project?.genre) lines.push(`類型：${project.genre}`);
  if (project?.tone) lines.push(`調性：${project.tone}`);
  if (project?.targetAudience) lines.push(`目標觀眾：${project.targetAudience}`);
  if (shots.length) {
    lines.push('', `影片內容（依分鏡順序的旁白／字幕／吐槽爆點${elided ? `；全片共 ${total} 鏡，以下為開頭與結尾段` : ''}）：`);
    shots.forEach((sh, i) => {
      if (elided && i === HEAD_SHOTS) lines.push('…（中段省略）…');
      const parts = [sh.caption, sh.tts, sh.punchline].map((p) => (p ?? '').trim()).filter(Boolean);
      if (parts.length) lines.push(`#${sh.shotNo} ${parts.join(' / ').slice(0, 140)}`);
    });
  }
  lines.push('', '請依上述內容產生這支影片的 YouTube 上架包裝。');

  const system = YT_SYSTEM + (story.system ? `\n\n${story.system}` : '');
  const userMsg = lines.join('\n');

  // Vertex/Gemini 偶爾回空字串（finishReason 空輸出）→ 最多重試一次，避免使用者看到隨機失敗。
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete({ system, messages: [{ role: 'user', content: userMsg }], maxTokens: 1200 });
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const meta = normalizeMeta(JSON.parse(m[0]) as Record<string, unknown>);
        if (meta.title || meta.description) return meta;
      } catch {
        /* 解析失敗 → 進入下一次重試 */
      }
    }
  }
  return { title: '', thumbnailText: '', description: '', hashtags: [], pinnedComment: '' };
}
