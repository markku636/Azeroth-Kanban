import { prisma } from '@/lib/prisma';
import { complete } from './llm';
import { buildStoryContext } from './story-context';
import { SHORT_FORM_CRAFT } from './interview';
import { tolerantJsonParse } from './json-tolerant';

// 「影片健檢」：把目前分鏡當成短影音初稿，用短影音黃金法則做評分 + 具體可執行的改進建議。
// 唯讀（不改專案），給使用者「這支會不會紅 / 哪裡要改」的回饋閉環。provider 由 LLM_PROVIDER 決定。

export interface AuditIssue {
  area: string; // 鉤子 / 節奏 / 笑點 / 爆點 / 長度 / 其他
  problem: string; // 問題描述（可點名第幾鏡）
  fix: string; // 具體怎麼改
}
export interface StoryboardAudit {
  score: number; // 0–100
  verdict: string; // 一句話總評
  strengths: string[];
  issues: AuditIssue[];
  suggestedTitle: string; // 順手給的更吸睛標題（可空）
  truncated?: boolean; // 分鏡數超過評估上限，僅列出前 N 鏡（仍依全片總數評估長度）
}

const AUDIT_SYSTEM = `你是嚴格但實用的短影音編輯，專門把影片改到會在 YouTube Shorts／抖音爆紅。根據使用者這支影片的分鏡（順序、旁白、字幕、吐槽爆點），用下列黃金法則做健檢：
${SHORT_FORM_CRAFT}
請給出：① 0–100 分（多數初稿落在 40–70，別灌水）；② 一句話總評；③ 2~3 個亮點；④ 2~5 個「具體、可執行」的改進建議（點名是哪一鏡、要怎麼改，不要空泛）；⑤ 順手給一個更吸睛的標題。
只回傳 JSON 物件（不要 markdown、不要多餘文字），格式：
{"score":0,"verdict":"...","strengths":["..."],"issues":[{"area":"鉤子|節奏|笑點|爆點|長度|其他","problem":"...","fix":"..."}],"suggestedTitle":"..."}`;

const MAX_SHOTS = 40;

function normalize(raw: Record<string, unknown>): StoryboardAudit {
  const arrStr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  const issues: AuditIssue[] = Array.isArray(raw.issues)
    ? raw.issues
        .map((i) => {
          const o = (i ?? {}) as Record<string, unknown>;
          return { area: String(o.area ?? '其他').trim(), problem: String(o.problem ?? '').trim(), fix: String(o.fix ?? '').trim() };
        })
        .filter((i) => i.problem || i.fix)
    : [];
  let score = Number(raw.score);
  if (!Number.isFinite(score)) score = 0;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    verdict: String(raw.verdict ?? '').trim(),
    strengths: arrStr(raw.strengths),
    issues,
    suggestedTitle: String(raw.suggestedTitle ?? '').trim(),
  };
}

/** 對專案目前分鏡做短影音健檢（不落庫）。 */
export async function auditStoryboard(projectId: string): Promise<StoryboardAudit> {
  const [project, story] = await Promise.all([
    prisma.studioProject.findUnique({ where: { id: projectId }, select: { title: true, logline: true, premise: true } }),
    buildStoryContext(projectId),
  ]);

  const [shots, totalShots] = await Promise.all([
    prisma.shot.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      select: { shotNo: true, visual: true, tts: true, caption: true, punchline: true, branch: true, punch: true },
      take: MAX_SHOTS,
    }),
    prisma.shot.count({ where: { projectId } }),
  ]);
  // 超過上限時，仍把「全片總鏡數」告訴 AI，否則它會誤判長度（以為片子比實際短）。
  const truncated = totalShots > shots.length;

  const lines: string[] = [];
  if (story.preamble) lines.push(story.preamble, '');
  if (project?.logline) lines.push(`前提：${project.logline}`);
  lines.push(`全片分鏡總數：${totalShots}`);
  if (truncated) lines.push(`（下面只列出前 ${MAX_SHOTS} 鏡供細看，但請依「全片共 ${totalShots} 鏡」評估整體長度與節奏）`);
  lines.push('', '分鏡（依序）：');
  for (const s of shots) {
    const bits = [
      s.caption ? `字幕「${s.caption}」` : '',
      s.tts ? `旁白「${s.tts}」` : '',
      s.punchline ? `爆點「${s.punchline}」` : '',
      s.punch ? '(反轉鏡)' : '',
    ].filter(Boolean);
    lines.push(`#${s.shotNo} [${s.branch}] ${bits.join(' ') || (s.visual ?? '').slice(0, 60)}`);
  }
  lines.push('', '請對這支影片做健檢並給出評分與具體改進建議。');

  const system = AUDIT_SYSTEM + (story.system ? `\n\n${story.system}` : '');
  const userMsg = lines.join('\n');

  // Vertex/Gemini 偶爾回空字串 → 最多重試一次。
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await complete({ system, messages: [{ role: 'user', content: userMsg }], maxTokens: 2048 });
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const audit = normalize(tolerantJsonParse(m[0]) as Record<string, unknown>);
        if (audit.verdict || audit.issues.length) return { ...audit, truncated };
      } catch {
        /* 解析失敗 → 重試 */
      }
    }
  }
  return { score: 0, verdict: '', strengths: [], issues: [], suggestedTitle: '', truncated };
}
