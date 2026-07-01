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

// LLM（尤其 Gemini）常在陣列/物件最後多一個逗號（`…},]` / `…",}`）→ JSON.parse 直接爆 → 整份生成靜默失敗回空。
// 移除結構性尾逗號（] } 前、只在字串外）。exported for testing; pure。
export function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[\]}])/g, '$1');
}

// 先嚴格 parse（合法 JSON 零風險）；失敗才清尾逗號重試（把常見的 LLM 尾逗號救回來，不硬吞其他錯）。
function tolerantJsonParse(src: string): unknown {
  try { return JSON.parse(src); } catch { /* 尾逗號等 → 清理後重試 */ }
  return JSON.parse(stripTrailingCommas(src)); // 仍失敗則由呼叫端 catch
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
    const raw: unknown = tolerantJsonParse(match ? match[0] : '[]');
    return Array.isArray(raw) ? raw.map(normalizeShot) : [];
  } catch {
    return [];
  }
}

// 短影音「好看」的黃金法則（資料驅動，2026 YouTube Shorts/抖音 retention 研究）。
// 注入到各生成 system prompt，讓產出的分鏡/腳本天生具備鉤子→爆點的吸睛結構。
export const SHORT_FORM_CRAFT = `短影音「好看」黃金法則（務必遵守，這是觀眾留不留下來的關鍵）：
1. 鉤子（第 1 個分鏡）：前 0.5~3 秒就要抓住人——用「視覺衝擊 + 大膽宣稱或懸念」開場，絕不慢慢鋪陳（約 5~6 成觀眾在前 3 秒就滑走）。第一句旁白直接拋出最荒謬/最有看點的鉤子，例如反差、衝突、「你絕對想不到…」。
2. 爆點（最後 1 個分鏡）：收在一個記得住的反轉或回扣（呼應開頭，讓人想再看一次／看留言）。下筆前先想好「開頭鉤子」與「結尾爆點」，中間每一鏡都是連接兩者的橋。
3. 每一鏡都要「推進或加碼」：刪掉任何不推進劇情、也不好笑的鏡頭。寧短勿拖，多用快切。
4. 喜劇用 setup→punchline 的「升級」結構：笑點一個比一個誇張、出乎意料，別重複同一個梗。
5. 旁白口語、有態度、短句（每句盡量 ≤15 字），跟得上快節奏；別用書面腔或冗詞。
6. 整體偏短：多用 2~4 秒短鏡，總長約 30~45 秒最吸睛；想好了就砍掉 3 成。`;

// 通用導演 + 喜劇能力：依使用者風格決定要不要用大字幕/音效/反轉欄位（不強制每片都搞笑）。
// export：新增分鏡協助（shot-assist.ts）共用同一份欄位規格。
export const SHOT_FIELDS = `每個分鏡物件欄位：
- visual：英文 SDXL 畫面描述。精煉具體（約 25–35 字詞，勿超過 SDXL 提示詞上限，否則尾端的光線/風格會被截斷）；建議順序 主體→動作/表情→場景→光線→鏡頭→風格氛圍，把主體與關鍵光線寫在前段、多用具體名詞少用空泛詞。**角色一致性**：若整支影片有固定主角，每一鏡的 visual 都用「同一組精簡外觀錨點」描述他（同樣的髮型/體型/服裝/特徵，例如 "balding middle-aged man in worn red cap"），讓每張圖看起來都是同一個人、畫面能連戲；錨點要短（幾個關鍵詞），別因此超出提示詞長度。**畫風一致性**：整支影片挑定「同一組風格結尾詞」（畫風＋色調＋質感，例如固定 "semi-realistic, warm cinematic color grade, soft lighting"）並貫穿每一鏡 visual 的結尾，別每鏡換不同風格詞（一鏡寫 photorealistic、下鏡寫 cartoonish 會讓整片畫風跳掉、不像同一支片）。**不要要求畫面內出現可讀的文字**（招牌/字幕/logo/看板上的具體字句，尤其中文）——SDXL 無法正確渲染文字，會變成亂碼；需要招牌時改描述它的顏色/形狀/風格/發光氛圍（例如 "a glowing neon storefront sign" 而非寫出招牌上的字）。文案交給後製字幕/大字幕欄位處理
- tts：繁體中文一句旁白或台詞
- motion：英文運鏡提示
- emotion：繁中情緒（會用於配音語氣，搞笑片可誇張，如「厭世吐槽」「震驚」「得意」）
- branch："still"（靜態 Ken-Burns，快）或 "i2v"（動態，慢）
- caption：可選，繁中「迷因大字幕」標語（setup）；一般敘事片可省略。**要短**（建議 ≤14 字，是滿版大字，太長會被切掉/擠成小字）
- punchline：可選，繁中「反轉下字幕」，會在反轉點彈出；同樣**要短有力**（建議 ≤14 字，越精煉越有梗）
- sfx：可選，卡點音效之一 "none"|"vineboom"|"scratch"|"rimshot"|"ding"|"whoosh"|"boing"
- punch：可選 true/false，此鏡是否為反轉/punchline（觸發放大變焦 + 下字幕彈出）
- punchAtFrac：可選 0~1，反轉點落在該鏡時長的比例（預設 0.55）
- punchZoom：可選 約 1.5~2.2，反轉放大倍率（預設 1.9）
若使用者想要「搞笑 / 迷因 / 吐槽」風格：用 setup→punchline 結構，誇張 emotion，反轉鏡設 punch=true 並配 vineboom/scratch/rimshot，caption 寫鋪陳、punchline 寫吐槽爆點。`;

const PLAN_SYSTEM = `你是專業 AI 短片分鏡導演，擅長各種風格，特別擅長能在 YouTube Shorts／抖音瘋傳的迷因吐槽喜劇。根據使用者的故事點子與風格，產生一份「抓得住人、好看」的分鏡表。
${SHORT_FORM_CRAFT}
${SHOT_FIELDS}
【硬性規則】畫面(visual)裡**絕對不要**要求出現可讀的文字／招牌字句／logo 字（SDXL 一定會渲染成亂碼，中文尤其慘）。就算劇情的爆點就是「招牌上寫著○○」，visual 也只描述招牌的顏色/形狀/發光風格（如 "a glowing pink bubble-tea storefront sign"），**把那句字放進 caption 或 punchline 欄位當大字幕呈現**（大字幕由後製燒錄，一定清楚）。
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
    const raw = tolerantJsonParse(match ? match[0] : '{}') as Record<string, unknown>;
    const scenes = Array.isArray(raw.scenes) ? raw.scenes.map(normalizeScene).filter((s) => s.title || s.synopsis) : [];
    return { logline: String(raw.logline ?? '').trim(), scenes };
  } catch {
    return { logline: '', scenes: [] };
  }
}

const SCRIPT_SYSTEM = `你是專業 AI 短片編劇，擅長寫能在社群瘋傳的短影音。根據使用者的故事題材，產生一份「腳本大綱」：一句話前提(logline) + 數個有先後順序的「故事場景」。
${SHORT_FORM_CRAFT}
特別注意：第一場必須是強鉤子（開門見山就有看點/衝突），最後一場必須收在記得住的爆點或反轉。
只回傳 JSON 物件（不要 markdown、不要多餘文字），格式：
{"logline":"一句話前提（要像會爆的影片標題一樣有看點/衝突/懸念）","scenes":[{"title":"場景標題","synopsis":"這一場在演什麼（2~4 句，含人物動作與轉折）","dialogue":"該場關鍵台詞或旁白草稿，可留空字串"}]}
要求：場景之間劇情連續、有起承轉合；台詞用繁體中文；synopsis 寫清楚畫面與情節但不要寫成分鏡（分鏡之後再展開）。`;

// ─────────────────────────── 故事聖經 AI 生成 ───────────────────────────
export interface PlannedBible {
  premise: string; worldSetting: string; styleGuide: string; tone: string; genre: string; targetAudience: string;
}
const BIBLE_SYSTEM = `你是專業編劇與世界觀設定師。根據使用者的題材，產生一份「故事設定（故事聖經）」。
premise 要有「高概念鉤子」：一句話就能講清楚、帶明顯反差或衝突、讓人想看下去（這份設定會貫穿之後所有分鏡，鉤子越強成片越吸睛）。
只回傳 JSON 物件（不要 markdown、不要多餘文字），格式：
{"premise":"核心前提，2-4句，含主角/目標/阻礙，且開頭就點出最大的反差或衝突鉤子","worldSetting":"世界觀背景：時代、地點、規則、氛圍","styleGuide":"視覺與敘事風格：鏡頭/色調/SDXL 風格關鍵字(可混入英文如 photorealistic, cinematic lighting)","tone":"語氣調性(如 迷因吐槽/溫馨/史詩)","genre":"類型","targetAudience":"目標觀眾"}
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
    const o = tolerantJsonParse(m ? m[0] : '{}') as Record<string, unknown>;
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

const CHAT_SYSTEM = `你是影片企劃精靈，用繁體中文和使用者對話，了解他想做的短片，擅長做能在 YouTube Shorts／抖音瘋傳的迷因吐槽喜劇。
規則：
- 先用 2~4 個「簡短」問題釐清：類型/風格（是否搞笑吐槽）、主角、長度或鏡頭數、氛圍。一次只問一個問題。
- 當資訊足夠，停止發問，直接輸出分鏡表，格式嚴格為：一行 <STORYBOARD> 後接 JSON 陣列，再接一行 </STORYBOARD>，陣列外不要任何文字。
${SHORT_FORM_CRAFT}
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
