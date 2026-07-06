import { complete } from './llm';

// 角色 prompt「魔法棒」：用 Gemini Vertex 把角色某一欄描述優化／改寫。
// 純文字轉換、不讀不寫 DB（角色尚未儲存也能用），且**一律走 vertex**（使用者指定 Google Vertex），
// 可帶單次模型覆寫（前端下拉選的 Google 模型，已由路由層白名單把關）。

export type CharField = 'persona' | 'appearance' | 'voiceInstruct';
export const CHAR_FIELDS: readonly CharField[] = ['persona', 'appearance', 'voiceInstruct'];

/** 允許的 Vertex 模型白名單（伺服器端安全把關；前端下拉只是 UX）。 */
export const ALLOWED_VERTEX_MODELS = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
] as const;
export type AllowedVertexModel = (typeof ALLOWED_VERTEX_MODELS)[number];
export const DEFAULT_VERTEX_MODEL: AllowedVertexModel = 'gemini-flash-latest';

export interface OptimizeInput {
  field: CharField;
  /** 目前欄位內容（可空，空時依名稱與脈絡從零生成）。 */
  text: string;
  /** 跨欄位脈絡（提升一致性）。 */
  name?: string;
  persona?: string;
  appearance?: string;
  /** 單次模型覆寫；省略時用 env 預設。應已由路由層白名單過濾。 */
  model?: string;
  /** 角色類型：'creature' 時 appearance 改用生物版方針（物種／輪廓／皮膚材質／眼睛特徵／配件錨點）；省略＝人類（舊行為）。 */
  kind?: 'creature';
}

const MAX_INPUT = 2000; // 餵給模型的單欄內容上限（路由層另有 4000 硬擋）

// 每欄不同的優化方針；共同要求：只輸出純文字，禁 markdown／引號／標題／任何說明。
const SYS: Record<CharField, string> = {
  persona:
    '你是角色設定編劇。請把使用者提供的角色「個性／背景」優化得更鮮明、具體、可餵給 AI 保持一致：' +
    '涵蓋性格、動機、說話風格與口頭禪。繁體中文，2–4 句、120 字內。' +
    '只輸出優化後的純文字，不要 markdown、不要引號、不要標題或任何說明文字。',
  appearance:
    'You are an expert SDXL prompt engineer. Rewrite the character APPEARANCE into a single clean ' +
    'English comma-separated visual prompt for consistent character rendering ' +
    '(age, build, hair, face, signature clothing/accessories, art style). ' +
    'Add 1-2 DISTINCTIVE identity anchors so the character stays recognizable across shots — PREFER a signature ' +
    'accessory / clothing / hairstyle (e.g. a red cap, thick-rimmed glasses, a ponytail); only name a facial mark ' +
    '(mole/scar) if the persona or existing appearance clearly implies one, since an invented facial mark can clash ' +
    'with the user\'s uploaded reference face. Keep it concise — one line, under 60 words. ' +
    'Output ONLY the prompt text — no markdown, no quotes, no labels, no explanations.',
  voiceInstruct:
    '你是配音導演。把角色的「語氣 instruct」優化成一句精煉的情緒／語調指令（供 TTS 用）。' +
    '繁體中文、12 字內，例如「厭世吐槽、語速偏快」。' +
    '只輸出該短句，不要 markdown、不要引號、不要任何說明。',
};

// appearance 的生物（creature）變體：身分錨點從人類的年齡／髮型／臉部特徵，
// 換成物種／輪廓／皮膚材質／眼睛特徵／配件；沿用「非臉部身分錨點」方向（避免與參考圖臉部衝突）。
const SYS_APPEARANCE_CREATURE: string =
  'You are an expert SDXL prompt engineer. Rewrite the CREATURE APPEARANCE into a single clean ' +
  'English comma-separated visual prompt for consistent creature rendering ' +
  '(species / creature type, overall silhouette and build, skin/fur/scale/feather material and color, ' +
  'eye shape and color, signature accessories, art style). ' +
  'Add 1-2 DISTINCTIVE identity anchors so the creature stays recognizable across shots — PREFER a signature ' +
  'accessory / body marking / silhouette trait (e.g. a bell collar, glowing amber eyes, a forked tail); ' +
  'keep anchors on the body, eyes or accessories rather than invented facial marks, since an invented facial ' +
  "mark can clash with the user's uploaded reference image. Keep it concise — one line, under 60 words. " +
  'Output ONLY the prompt text — no markdown, no quotes, no labels, no explanations.';

function buildUser(input: OptimizeInput): string {
  const ctx: string[] = [];
  if (input.name?.trim()) ctx.push(`角色名稱：${input.name.trim()}`);
  if (input.field !== 'persona' && input.persona?.trim())
    ctx.push(`角色個性／背景：${input.persona.trim().slice(0, 500)}`);
  if (input.field !== 'appearance' && input.appearance?.trim())
    ctx.push(`外觀：${input.appearance.trim().slice(0, 500)}`);
  const cur = input.text.trim().slice(0, MAX_INPUT);
  ctx.push(
    cur
      ? `目前內容（請優化／改寫）：\n${cur}`
      : '目前內容為空，請依角色名稱與上述脈絡「從零生成」一份合理內容。',
  );
  return ctx.join('\n');
}

/** 後處理：模型偶爾仍會包 code fence／引號／欄位標籤，這裡保險清掉。 */
function clean(out: string): string {
  let s = out.trim();
  s = s.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '').trim(); // 去 code fence
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('「') && s.endsWith('」')))
    s = s.slice(1, -1).trim(); // 去包覆引號（含「」）
  s = s.replace(/^(persona|appearance|voiceInstruct|個性|背景|外觀|語氣)[:：]\s*/i, '').trim(); // 去誤帶標籤
  return s;
}

/** 用 Vertex 優化單一角色欄位，回傳乾淨純文字（不落庫）。 */
export async function optimizeCharacterField(input: OptimizeInput): Promise<string> {
  // kind='creature' 只影響 appearance 的方針；其餘欄位人類／生物共用。
  const system =
    input.field === 'appearance' && input.kind === 'creature'
      ? SYS_APPEARANCE_CREATURE
      : SYS[input.field];
  const out = await complete(
    {
      system,
      messages: [{ role: 'user', content: buildUser(input) }],
      temperature: input.field === 'appearance' ? 0.6 : 0.8,
      // 2048 而非 512：gemini-2.5-flash/pro 預設開啟 thinking，思考 token 與輸出共用此預算；
      // 512 會被思考耗盡導致空輸出（finishReason=MAX_TOKENS）。輸出本身很短，放寬無副作用。
      maxTokens: 2048,
      model: input.model,
    },
    'vertex', // 強制走 Vertex（使用者指定 Google Vertex 優化）
  );
  return clean(out);
}
