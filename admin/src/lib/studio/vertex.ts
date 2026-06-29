import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

// Gemini on Vertex AI — service-account JWT → access token → REST generateContent。
// 不引入第三方 SDK（用 Node 內建 crypto 自簽 JWT 換 token），與 Python 端 gen_prompts_gemini.py 同模型預設。
// 僅在 LLM_PROVIDER=vertex 時需要下列設定：
//   GOOGLE_VERTEX_PROJECT        GCP 專案 id（必填）
//   GOOGLE_VERTEX_LOCATION       區域，預設 global（gemini-flash-latest 走 global）
//   GOOGLE_VERTEX_MODEL          模型，預設 gemini-flash-latest
//   GOOGLE_VERTEX_CREDENTIALS    service account JSON 字串（Docker 用，優先）
//   GOOGLE_APPLICATION_CREDENTIALS  或：SA JSON 檔路徑（本機開發用）

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export interface VertexMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function loadServiceAccount(): ServiceAccount | null {
  const inline = process.env.GOOGLE_VERTEX_CREDENTIALS?.trim();
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  let raw = '';
  try {
    raw = inline ? inline : path ? readFileSync(path, 'utf8') : '';
  } catch {
    return null; // 檔案讀不到
  }
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    if (!sa.client_email || !sa.private_key) return null;
    // 環境變數常把換行存成字面 \n → 還原成真換行，否則 RSA 簽章會失敗
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    return sa;
  } catch {
    return null; // JSON 壞掉
  }
}

const project = (): string => process.env.GOOGLE_VERTEX_PROJECT?.trim() || '';
const location = (): string => process.env.GOOGLE_VERTEX_LOCATION?.trim() || 'global';
const modelName = (): string => process.env.GOOGLE_VERTEX_MODEL?.trim() || 'gemini-flash-latest';

/** 是否已備齊 Vertex 所需設定（給 /config 與路由層做前置檢查）。 */
export function vertexConfigured(): boolean {
  return Boolean(project()) && loadServiceAccount() !== null;
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function backoffMs(attempt: number, retryAfter: string | null): number {
  const ra = retryAfter ? Number(retryAfter) * 1000 : 0;
  if (ra > 0) return Math.min(ra, 10_000);
  return Math.min(500 * 2 ** attempt + Math.floor(Math.random() * 250), 8_000);
}

/** generateContent fetch：加逾時，對 429/503 與網路/逾時錯誤做有限次退避重試（honor Retry-After）。 */
async function fetchWithRetry(url: string, init: RequestInit, timeoutMs: number, retries: number): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if ((res.status === 429 || res.status === 503) && attempt < retries) {
        await sleep(backoffMs(attempt, res.headers.get('retry-after')));
        continue;
      }
      return res;
    } catch (e) {
      if (attempt < retries) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw new Error(isAbortError(e) ? 'Vertex 生成逾時，請稍後再試' : 'Vertex 連線失敗，請稍後再試');
    }
  }
}

// access token 快取（提早 60s 視為過期）；用 globalThis 單例避免 dev HMR 反覆重取（比照 prisma.ts/queue.ts）。
const g = globalThis as unknown as { __vertexToken?: { token: string; exp: number } };

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (g.__vertexToken && g.__vertexToken.exp - 60 > now) return g.__vertexToken.token;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
  const jwt = `${header}.${claims}.${b64url(signature)}`;

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
      signal: AbortSignal.timeout(Number(process.env.VERTEX_TOKEN_TIMEOUT_MS ?? 15_000)),
    });
  } catch (e) {
    throw new Error(isAbortError(e) ? 'Vertex 取得 access token 逾時' : 'Vertex 連線失敗（access token）');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // 不外洩 Google 原始錯誤體；僅伺服器端 log，對外只回 status。
    console.error('[vertex] token exchange failed', res.status, detail.slice(0, 500));
    throw new Error(`Vertex 取得 access token 失敗（${res.status}）`);
  }
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error('Vertex 未回傳 access token');
  g.__vertexToken = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

function endpoint(model?: string): string {
  const loc = location();
  // global 用無區域前綴的端點；其他區域用 {loc}-aiplatform.googleapis.com
  const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
  // model 省略時用 env 預設（modelName）；帶入時為單次覆寫（如角色魔法棒選的模型）。
  const m = model?.trim() || modelName();
  return `https://${host}/v1/projects/${project()}/locations/${loc}/publishers/google/models/${m}:generateContent`;
}

/** 單輪生成：system 指令 + 多輪對話 → 純文字。assistant 角色映射成 Vertex 的 'model'。 */
export async function generateText(opts: {
  system: string;
  messages: VertexMessage[];
  temperature?: number;
  maxTokens?: number;
  /** 單次模型覆寫；省略時用 env GOOGLE_VERTEX_MODEL 預設。 */
  model?: string;
}): Promise<string> {
  if (!project()) throw new Error('Vertex 未設定：缺少 GOOGLE_VERTEX_PROJECT');
  const sa = loadServiceAccount();
  if (!sa) throw new Error('Vertex 未設定：缺少 service account（GOOGLE_VERTEX_CREDENTIALS 或 GOOGLE_APPLICATION_CREDENTIALS）');

  const token = await accessToken(sa);
  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    // 思考型模型（gemini 2.5 系）會先花 ~1000–1800 個 thinking tokens 才產生答案；
    // 太低的上限會讓 JSON 答案被 MAX_TOKENS 截斷（→ 解析失敗 → 像「空回應」）。
    // 故設一個能容納 thinking+答案 的下限；上限拉高不會讓短答案變長（模型仍會在 STOP 自然結束、只計實際 tokens）。
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: Math.max(opts.maxTokens ?? 4096, 4096),
    },
  };

  // Gemini 偶爾回「空輸出 + finishReason=STOP」（已知間歇性 quirk）→ 在來源處重試最多 3 次，
  // 讓所有生成路徑（分鏡/聖經/魔法棒/YouTube 文案/健檢）都更穩，少掉隨機空回應的失敗。
  const EMPTY_RETRIES = 3;
  for (let attempt = 0; attempt < EMPTY_RETRIES; attempt++) {
    const res = await fetchWithRetry(
      endpoint(opts.model),
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      Number(process.env.VERTEX_TIMEOUT_MS ?? 60_000),
      2,
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // 不外洩 Google 原始錯誤體（含 project 路徑/配額細節）；僅伺服器端 log，對外只回 status。
      console.error('[vertex] generateContent failed', res.status, detail.slice(0, 500));
      throw new Error(`Vertex 生成失敗（${res.status}）`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: Record<string, number>;
    };
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
    if (text) return text;
    // 空輸出但結束原因非正常（MAX_TOKENS/SAFETY/RECITATION）→ 重試無益，丟可辨識錯誤。
    if (cand?.finishReason && cand.finishReason !== 'STOP') {
      throw new Error(`Vertex 無輸出（finishReason=${cand.finishReason}）`);
    }
    // 空輸出 + STOP/未知 = 偶發空回應 → 換下一次嘗試
  }
  return '';
}
