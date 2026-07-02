// SealTTSClient — TTS engine adapter (port of gen_voiceover.synth). Generic: any speaker/engine/emotion.
export interface TtsOptions {
  speaker: string;
  text: string;
  engine?: string;          // this server is cosyvoice3-only
  instruct?: string;        // emotion (one line)
  speed?: number;
  pitch?: number;
  loraScale?: number;       // REQUIRED by /v1/tts — always sent
  temperature?: number;
  topP?: number;
  topK?: number;
  repetitionPenalty?: number;
  maxNewTokens?: number;
  normalize?: boolean;
  llmScale?: number;        // cosyvoice3
  flowScale?: number;       // cosyvoice3
  flowSteps?: number;       // cosyvoice3
  timeoutMs?: number;
}

export interface TtsResult { wav: Buffer; durationSec: number; sampleRate: number }

/**
 * 送進 TTS 前把旁白文字正規化——LLM 偶爾夾帶不該被「念出來」的東西（markdown 星號/反引號/井字、markdown 連結、
 * 換行、多餘空白），TTS 會照字面念成怪聲或破壞語氣。這裡把它們清掉/收斂成自然停頓；中文字與 。！？…， 等
 * 語氣標點原樣保留。純函式、exported for testing。
 */
export function normalizeTtsText(s: string): string {
  return (s ?? "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // markdown 連結 [文字](url) → 只留文字
    .replace(/[*_`~#>|]/g, "")               // 其餘 markdown 標記（不該念出）
    .replace(/\s+/g, " ")                     // 換行 / tab / 多空白 → 單一空白（TTS 讀成自然停頓）
    .trim();
}

export class SealTTSClient {
  constructor(private baseUrl = "http://192.168.50.57:7866", private apiKey = "") {}

  async synth(o: TtsOptions): Promise<TtsResult> {
    const payload: Record<string, unknown> = {
      speaker: o.speaker, text: normalizeTtsText(o.text), engine: o.engine ?? "cosyvoice3",
      response_mode: "base64", format: "wav",
      lora_scale: o.loraScale ?? 0.0,                 // REQUIRED
      speed: o.speed ?? 1.0,
      temperature: o.temperature ?? 0.9, top_p: o.topP ?? 0.85, top_k: o.topK ?? 30,
      repetition_penalty: o.repetitionPenalty ?? 1.05, max_new_tokens: o.maxNewTokens ?? 4096,
      normalize: o.normalize ?? true,
      flow_steps: o.flowSteps ?? 35, llm_scale: o.llmScale ?? 0.8, flow_scale: o.flowScale ?? 0.3,
    };
    if (o.instruct) payload.instruct = o.instruct;
    if (o.pitch !== undefined) payload.pitch = o.pitch;

    // Retry transient failures (network error, timeout, 5xx) with backoff — a single hiccup shouldn't
    // fail a whole shot's render during an overnight batch. 4xx (auth / bad request) fails fast (no retry).
    const attempts = 3;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      let r: Response;
      try {
        r = await fetch(`${this.baseUrl}/v1/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": this.apiKey },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(o.timeoutMs ?? 180_000),   // cold-start ~100s
        });
      } catch (e) {
        lastErr = e;                                             // network / timeout → retryable
        if (attempt < attempts) { await new Promise((res) => setTimeout(res, attempt * 1500)); continue; }
        throw e instanceof Error ? new Error(`/v1/tts request failed after ${attempts} tries: ${e.message}`) : e;
      }
      if (r.ok) {
        const data = (await r.json()) as { audio_base64: string; duration_sec?: number; sample_rate?: number };
        return { wav: Buffer.from(data.audio_base64, "base64"), durationSec: data.duration_sec ?? 0, sampleRate: data.sample_rate ?? 24000 };
      }
      const body = (await r.text()).slice(0, 400);
      if (r.status >= 500 && attempt < attempts) {               // transient server error → retry
        lastErr = new Error(`/v1/tts ${r.status}: ${body}`);
        await new Promise((res) => setTimeout(res, attempt * 1500));
        continue;
      }
      throw new Error(`/v1/tts ${r.status}: ${body}`);           // 4xx, or final 5xx → fail
    }
    throw lastErr instanceof Error ? lastErr : new Error(`/v1/tts failed after ${attempts} tries`);
  }

  async speakers(): Promise<unknown> {
    const r = await fetch(`${this.baseUrl}/v1/speakers`, { headers: { "X-API-Key": this.apiKey }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`/v1/speakers ${r.status}`);
    return r.json();
  }
}
