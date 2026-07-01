import { prisma } from '@/lib/prisma';
import { complete, type LlmMessage, type LlmProvider } from '../llm';
import { buildStoryContext } from '../story-context';
import { PROPOSAL_SPEC, parseProposals, type Proposal } from './proposals';
import { tolerantJsonParse } from '../json-tolerant';

// UI 端可選的三個供應商。
//  - anthropic / vertex：單回合（整個專案現況放進 context）→ 回覆 + 提案。
//  - claude-agent：多步「逐步查詢」迴圈（可在提案前 <FETCH> 取某鏡/某場/角色庫完整內容），更像真・agent。
//    （literal @anthropic-ai/claude-agent-sdk 因 peer zod v4 與本專案 zod v3 衝突，改用此零依賴迴圈實作。）
export type AgentProvider = 'anthropic' | 'vertex' | 'claude-agent';

export interface AgentMessage { role: 'user' | 'assistant'; content: string }
export interface AgentTurnResult { reply: string; proposals: Proposal[]; provider: AgentProvider }

const AGENT_SYSTEM = `你是「AI 影片導演助手」，協助使用者規劃與製作短片。你能讀取整個專案（故事設定、場景、分鏡、角色），用繁體中文跟使用者討論，並在需要時主動「提案」建立或修改資料。
原則：先理解使用者意圖→（必要時）讀〈專案現況〉→提出清楚可審核的提案。破壞性或大範圍改動要在文字裡說明清楚。產出一律與〈故事聖經〉一致。
${PROPOSAL_SPEC}`;

const FETCH_SPEC = `你具備「逐步查詢」能力：若在提案前需要某筆資料的完整內容，請「單獨一行」輸出 <FETCH>{json}</FETCH> 來查詢，我會把結果回給你後你再繼續。可用查詢（一次一筆）：
- {"get_shot":"<shotId>"}：取某分鏡完整欄位
- {"get_scene":"<sceneId>"}：取某場景完整內容與其分鏡
- {"list_characters":true}：取角色庫全部角色（含個性/外觀/語音）
規則：查到足夠資訊就直接給「回覆 + <PROPOSALS>」，不要無止盡查詢；不需要查詢時就直接回覆。`;

const MAX_FETCH = 4;

interface OwnerScope { ownerId: string; bypass: boolean }

/** 把目前專案現況整理成可讀 + 帶真實 id 的區塊，注入 system。 */
async function buildProjectState(projectId: string, scope: OwnerScope): Promise<string> {
  const charWhere = scope.bypass ? { isArchived: false } : { ownerId: scope.ownerId, isArchived: false };
  const [scenes, shots, projChars, allChars] = await Promise.all([
    prisma.scene.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, synopsis: true } }),
    prisma.shot.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' }, select: { id: true, shotNo: true, sceneId: true, visual: true, tts: true, characterId: true } }),
    prisma.projectCharacter.findMany({ where: { projectId }, include: { character: { select: { id: true, name: true } } } }),
    prisma.character.findMany({ where: charWhere, select: { id: true, name: true }, take: 50 }),
  ]);
  const lines: string[] = ['<專案現況>'];
  lines.push(`場景（${scenes.length}）：`);
  for (const s of scenes) lines.push(`- [scene ${s.id}] ${s.title}${s.synopsis ? `：${s.synopsis.slice(0, 80)}` : ''}`);
  if (!scenes.length) lines.push('（尚無場景）');
  lines.push(`分鏡（${shots.length}）：`);
  for (const s of shots) {
    const desc = (s.visual || s.tts || '').toString().slice(0, 70);
    lines.push(`- [shot ${s.id}] #${s.shotNo}${s.sceneId ? ` (scene ${s.sceneId})` : ' (未分場)'}${s.characterId ? ` [char ${s.characterId}]` : ''}：${desc}`);
  }
  if (!shots.length) lines.push('（尚無分鏡）');
  lines.push('本專案角色：');
  for (const pc of projChars) lines.push(`- [char ${pc.character.id}] ${pc.character.name}${pc.roleInStory ? `（${pc.roleInStory}）` : ''}`);
  if (!projChars.length) lines.push('（尚未指定角色）');
  const attachedIds = new Set(projChars.map((pc) => pc.characterId));
  const libIdle = allChars.filter((c) => !attachedIds.has(c.id));
  if (libIdle.length) { lines.push('角色庫（尚未加入本專案，可用 attach_character 加入）：'); for (const c of libIdle) lines.push(`- [char ${c.id}] ${c.name}`); }
  lines.push('</專案現況>');
  return lines.join('\n');
}

/** 執行一筆 <FETCH> 查詢（read-only，scoped 到本專案 / 本人角色庫）。回傳可讀字串。 */
async function executeFetch(projectId: string, scope: OwnerScope, raw: string): Promise<string> {
  let action: Record<string, unknown>;
  try { const j = raw.match(/\{[\s\S]*\}/); action = tolerantJsonParse(j ? j[0] : '{}') as Record<string, unknown>; } catch { return '查詢格式錯誤（需 JSON）。'; }
  if (typeof action.get_shot === 'string') {
    const s = await prisma.shot.findFirst({ where: { id: action.get_shot, projectId } });
    if (!s) return '找不到此分鏡。';
    return JSON.stringify({ id: s.id, shotNo: s.shotNo, sceneId: s.sceneId, visual: s.visual, tts: s.tts, motion: s.motion, emotion: s.emotion, branch: s.branch, caption: s.caption, punchline: s.punchline, sfx: s.sfx, punch: s.punch, characterId: s.characterId }, null, 1);
  }
  if (typeof action.get_scene === 'string') {
    const sc = await prisma.scene.findFirst({ where: { id: action.get_scene, projectId } });
    if (!sc) return '找不到此場景。';
    const shots = await prisma.shot.findMany({ where: { sceneId: sc.id }, orderBy: { sortOrder: 'asc' }, select: { id: true, shotNo: true, visual: true, tts: true } });
    return JSON.stringify({ id: sc.id, title: sc.title, synopsis: sc.synopsis, dialogue: sc.dialogue, shots }, null, 1);
  }
  if (action.list_characters) {
    const where = scope.bypass ? { isArchived: false } : { ownerId: scope.ownerId, isArchived: false };
    const cs = await prisma.character.findMany({ where, take: 50, select: { id: true, name: true, persona: true, appearance: true, sealSpeaker: true, voiceInstruct: true } });
    return JSON.stringify(cs, null, 1);
  }
  return '不支援的查詢。可用：get_shot / get_scene / list_characters。';
}

function toLlmProvider(p: AgentProvider): LlmProvider {
  return p === 'vertex' ? 'vertex' : 'anthropic';
}

/** 跑一回合 agent：讀專案現況 + 故事聖經 → 呼叫所選 provider → 解析回覆與提案。 */
export async function runAgentTurn(args: {
  projectId: string;
  ownerId: string;
  bypass: boolean;
  provider: AgentProvider;
  history: AgentMessage[];
  message: string;
}): Promise<AgentTurnResult> {
  const { projectId, provider, history, message } = args;
  const scope: OwnerScope = { ownerId: args.ownerId, bypass: args.bypass };
  const [story, state] = await Promise.all([buildStoryContext(projectId), buildProjectState(projectId, scope)]);
  const baseSystem = [AGENT_SYSTEM, story.system, story.preamble, state].filter(Boolean).join('\n\n');
  const baseMessages: LlmMessage[] = [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user' as const, content: message }];
  const llm = toLlmProvider(provider);

  // 單回合（anthropic / vertex）
  if (provider !== 'claude-agent') {
    const text = await complete({ system: baseSystem, messages: baseMessages, maxTokens: 3072 }, llm);
    const { reply, proposals } = parseProposals(text);
    return { reply, proposals, provider };
  }

  // 多步「逐步查詢」迴圈（claude-agent）
  const system = `${baseSystem}\n\n${FETCH_SPEC}`;
  const convo: LlmMessage[] = [...baseMessages];
  for (let i = 0; i < MAX_FETCH; i++) {
    const text = await complete({ system, messages: convo, maxTokens: 3072 }, llm);
    const fm = text.match(/<FETCH>([\s\S]*?)<\/FETCH>/);
    if (!fm) { const { reply, proposals } = parseProposals(text); return { reply, proposals, provider }; }
    const result = await executeFetch(projectId, scope, fm[1]);
    convo.push({ role: 'assistant', content: text }, { role: 'user', content: `<FETCH_RESULT>\n${result}\n</FETCH_RESULT>` });
  }
  // 達查詢上限：強制收斂
  const finalText = await complete({ system: `${system}\n\n（已達查詢上限，請直接給出回覆與提案，不要再 <FETCH>。）`, messages: convo, maxTokens: 3072 }, llm);
  const { reply, proposals } = parseProposals(finalText);
  return { reply, proposals, provider };
}
