import { complete } from './llm';
import type { StoryContext } from './story-context';

/** 把故事聖經併進 system；preamble 由各函式接在第一則 user 訊息前。 */
function withStorySystem(base: string, story?: StoryContext): string {
  return base + (story?.system ? `\n\n${story.system}` : '');
}
function storyPreamble(story?: StoryContext): string {
  return story?.preamble ? `${story.preamble}\n\n` : '';
}

// 卡點音效（與 engine/sfx.ts 的 SfxName 對齊；'none' = 不放音效）
export type ShotSfx = 'none' | 'vineboom' | 'scratch' | 'rimshot' | 'ding' | 'whoosh' | 'boing';
const SFX_SET = new Set<string>(['none', 'vineboom', 'scratch', 'rimshot', 'ding', 'whoosh', 'boing']);

export interface PlannedShot {
  visual: string; // English SDXL prompt
  tts: string; // 繁中旁白一句
  motion: string; // English camera/motion hint
  emotion: string; // 繁中情緒（配音語氣）
  branch: 'still' | 'i2v';
  // 以下為「迷因吐槽喜劇」可選欄位（一般敘事片可留空 / none / false）
  caption?: string; // 迷因大字幕（setup 標語）
  punchline?: string; // 反轉時彈出的下字幕
  sfx?: ShotSfx; // 卡點音效
  punch?: boolean; // 是否為反轉鏡（觸發 punch-in 變焦 + 下字幕彈出）
  punchAtFrac?: number; // 反轉點佔該鏡時長比例 (0–1)
  punchZoom?: number; // 反轉變焦倍率
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function normalizeShot(s: unknown): PlannedShot {
  const o = (s ?? {}) as Record<string, unknown>;
  const sfx = typeof o.sfx === 'string' && SFX_SET.has(o.sfx) ? (o.sfx as ShotSfx) : 'none';
  return {
    visual: String(o.visual ?? ''),
    tts: String(o.tts ?? ''),
    motion: String(o.motion ?? ''),
    emotion: String(o.emotion ?? ''),
    branch: o.branch === 'i2v' ? 'i2v' : 'still',
    caption: o.caption != null && String(o.caption).trim() ? String(o.caption) : undefined,
    punchline: o.punchline != null && String(o.punchline).trim() ? String(o.punchline) : undefined,
    sfx,
    punch: Boolean(o.punch),
    punchAtFrac: typeof o.punchAtFrac === 'number' ? o.punchAtFrac : undefined,
    punchZoom: typeof o.punchZoom === 'number' ? o.punchZoom : undefined,
  };
}

export function parseShotArray(text: string): PlannedShot[] {
  const match = text.match(/\[[\s\S]*\]/);
  try {
    const raw: unknown = JSON.parse(match ? match[0] : '[]');
    return Array.isArray(raw) ? raw.map(normalizeShot) : [];
  } catch {
    return [];
  }
}

// 通用導演 + 喜劇能力：依使用者風格決定要不要用大字幕/音效/反轉欄位（不強制每片都搞笑）。
// export：新增分鏡協助（shot-assist.ts）共用同一份欄位規格。
export const SHOT_FIELDS = `每個分鏡物件欄位：
- visual：英文 SDXL 畫面描述。精煉具體（約 25–35 字詞，勿超過 SDXL 提示詞上限，否則尾端的光線/風格會被截斷）；建議順序 主體→動作/表情→場景→光線→鏡頭→風格氛圍，把主體與關鍵光線寫在前段、多用具體名詞少用空泛詞
- tts：繁體中文一句旁白或台詞
- motion：英文運鏡提示
- emotion：繁中情緒（會用於配音語氣，搞笑片可誇張，如「厭世吐槽」「震驚」「得意」）
- branch："still"（靜態 Ken-Burns，快）或 "i2v"（動態，慢）
- caption：可選，繁中「迷因大字幕」標語（setup）；一般敘事片可省略
- punchline：可選，繁中「反轉下字幕」，會在反轉點彈出
- sfx：可選，卡點音效之一 "none"|"vineboom"|"scratch"|"rimshot"|"ding"|"whoosh"|"boing"
- punch：可選 true/false，此鏡是否為反轉/punchline（觸發放大變焦 + 下字幕彈出）
- punchAtFrac：可選 0~1，反轉點落在該鏡時長的比例（預設 0.55）
- punchZoom：可選 約 1.5~2.2，反轉放大倍率（預設 1.9）
若使用者想要「搞笑 / 迷因 / 吐槽」風格：用 setup→punchline 結構，誇張 emotion，反轉鏡設 punch=true 並配 vineboom/scratch/rimshot，caption 寫鋪陳、punchline 寫吐槽爆點。`;

const PLAN_SYSTEM = `你是專業 AI 短片分鏡導演，擅長各種風格，特別擅長迷因吐槽喜劇。根據使用者的故事點子與風格，產生一份分鏡表。
${SHOT_FIELDS}
只回傳 JSON 陣列，不要任何其他文字或 markdown。`;

/** 單輪：故事點子 → 分鏡表（provider 由 LLM_PROVIDER 決定）。 */
export async function planStoryboard(idea: string, count = 6, story?: StoryContext): Promise<PlannedShot[]> {
  const text = await complete({
    system: withStorySystem(PLAN_SYSTEM, story),
    messages: [{ role: 'user', content: `${storyPreamble(story)}故事點子：「${idea}」。請產生 ${count} 個分鏡。` }],
  });
  return parseShotArray(text);
}

// ─────────────────────────── 腳本層（logline + 分場大綱） ───────────────────────────

export interface PlannedScene {
  title: string; // 場景標題（繁中）
  synopsis: string; // 劇情概要：這一場在演什麼（繁中）
  dialogue: string; // 台詞／旁白草稿（繁中，可空字串）
}
export interface PlannedScript {
  logline: string; // 一句話前提
  scenes: PlannedScene[];
}

function normalizeScene(s: unknown): PlannedScene {
  const o = (s ?? {}) as Record<string, unknown>;
  return {
    title: String(o.title ?? '').trim(),
    synopsis: String(o.synopsis ?? '').trim(),
    dialogue: String(o.dialogue ?? '').trim(),
  };
}

function parseScript(text: string): PlannedScript {
  const match = text.match(/\{[\s\S]*\}/);
  try {
    const raw = JSON.parse(match ? match[0] : '{}') as Record<string, unknown>;
    const scenes = Array.isArray(raw.scenes) ? raw.scenes.map(normalizeScene).filter((s) => s.title || s.synopsis) : [];
    return { logline: String(raw.logline ?? '').trim(), scenes };
  } catch {
    return { logline: '', scenes: [] };
  }
}

const SCRIPT_SYSTEM = `你是專業 AI 短片編劇。根據使用者的故事題材，產生一份「腳本大綱」：一句話前提(logline) + 數個有先後順序的「故事場景」。
只回傳 JSON 物件（不要 markdown、不要多餘文字），格式：
{"logline":"一句話前提","scenes":[{"title":"場景標題","synopsis":"這一場在演什麼（2~4 句，含人物動作與轉折）","dialogue":"該場關鍵台詞或旁白草稿，可留空字串"}]}
要求：場景之間劇情連續、有起承轉合；台詞用繁體中文；synopsis 寫清楚畫面與情節但不要寫成分鏡（分鏡之後再展開）。`;

// ─────────────────────────── 故事聖經 AI 生成 ───────────────────────────
export interface PlannedBible {
  premise: string; worldSetting: string; styleGuide: string; tone: string; genre: string; targetAudience: string;
}
const BIBLE_SYSTEM = `你是專業編劇與世界觀設定師。根據使用者的題材，產生一份「故事設定（故事聖經）」。
只回傳 JSON 物件（不要 markdown、不要多餘文字），格式：
{"premise":"核心前提，2-4句，含主角/目標/阻礙","worldSetting":"世界觀背景：時代、地點、規則、氛圍","styleGuide":"視覺與敘事風格：鏡頭/色調/SDXL 風格關鍵字(可混入英文如 photorealistic, cinematic lighting)","tone":"語氣調性(如 迷因吐槽/溫馨/史詩)","genre":"類型","targetAudience":"目標觀眾"}
以繁體中文為主；styleGuide 可含英文 SDXL 風格詞。`;

/** 題材一句話 → 完整故事聖經欄位（供「故事設定」頁一鍵生成）。 */
export async function planStoryBible(seed: string, story?: StoryContext): Promise<PlannedBible> {
  const text = await complete({
    system: withStorySystem(BIBLE_SYSTEM, story),
    messages: [{ role: 'user', content: `${storyPreamble(story)}題材：「${seed}」。請產生故事設定。` }],
    maxTokens: 1500,
  });
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const o = JSON.parse(m ? m[0] : '{}') as Record<string, unknown>;
    const s = (k: string) => String(o[k] ?? '').trim();
    return { premise: s('premise'), worldSetting: s('worldSetting'), styleGuide: s('styleGuide'), tone: s('tone'), genre: s('genre'), targetAudience: s('targetAudience') };
  } catch {
    return { premise: '', worldSetting: '', styleGuide: '', tone: '', genre: '', targetAudience: '' };
  }
}

/** 題材 → 腳本大綱（logline + 分場）。供「腳本」階段的 AI 生成。 */
export async function planScript(premise: string, sceneCount = 4, story?: StoryContext): Promise<PlannedScript> {
  const n = Math.min(12, Math.max(1, sceneCount));
  const text = await complete({
    system: withStorySystem(SCRIPT_SYSTEM, story),
    messages: [{ role: 'user', content: `${storyPreamble(story)}故事題材：「${premise}」。請產生 ${n} 個故事場景的腳本大綱。` }],
    maxTokens: 2048,
  });
  return parseScript(text);
}

/** 單一故事場景 → 分鏡表。把該場 synopsis/dialogue 展開成 shots。 */
export async function planSceneShots(
  scene: { title: string; synopsis?: string | null; dialogue?: string | null },
  count = 3,
  context?: { logline?: string | null; premise?: string | null },
  story?: StoryContext,
): Promise<PlannedShot[]> {
  const n = Math.min(12, Math.max(1, count));
  const ctx = [
    context?.premise ? `整體題材：${context.premise}` : '',
    context?.logline ? `前提：${context.logline}` : '',
  ].filter(Boolean).join('\n');
  const text = await complete({
    system: withStorySystem(PLAN_SYSTEM, story),
    messages: [
      {
        role: 'user',
        content: `${storyPreamble(story)}${ctx ? ctx + '\n\n' : ''}這是其中一個故事場景：\n標題：${scene.title}\n劇情概要：${scene.synopsis ?? ''}\n台詞/旁白：${scene.dialogue ?? ''}\n\n請只為「這一場」產生 ${n} 個分鏡，延續整體風格與連戲。`,
      },
    ],
  });
  return parseShotArray(text);
}

const CHAT_SYSTEM = `你是影片企劃精靈，用繁體中文和使用者對話，了解他想做的短片，擅長迷因吐槽喜劇。
規則：
- 先用 2~4 個「簡短」問題釐清：類型/風格（是否搞笑吐槽）、主角、長度或鏡頭數、氛圍。一次只問一個問題。
- 當資訊足夠，停止發問，直接輸出分鏡表，格式嚴格為：一行 <STORYBOARD> 後接 JSON 陣列，再接一行 </STORYBOARD>，陣列外不要任何文字。
${SHOT_FIELDS}`;

export type ChatResult = { done: false; reply: string } | { done: true; shots: PlannedShot[] };

/** 多輪：對話 → 下一個問題，或（資訊足夠時）最終分鏡表。 */
export async function chatStoryboard(messages: ChatMessage[], story?: StoryContext): Promise<ChatResult> {
  const system = withStorySystem(CHAT_SYSTEM, story) + (story?.preamble ? `\n\n${story.preamble}` : '');
  const text = await complete({ system, messages });
  const m = text.match(/<STORYBOARD>([\s\S]*?)<\/STORYBOARD>/);
  if (m) {
    const shots = parseShotArray(m[1]);
    if (shots.length) return { done: true, shots };
  }
  return { done: false, reply: text.replace(/<\/?STORYBOARD>/g, '').trim() };
}
