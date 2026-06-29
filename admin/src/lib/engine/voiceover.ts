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

export class SealTTSClient {
  constructor(private baseUrl = "http://192.168.50.57:7866", private apiKey = "") {}

  async synth(o: TtsOptions): Promise<TtsResult> {
    const payload: Record<string, unknown> = {
      speaker: o.speaker, text: o.text, engine: o.engine ?? "cosyvoice3",
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

    const r = await fetch(`${this.baseUrl}/v1/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": this.apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(o.timeoutMs ?? 180_000),   // cold-start ~100s
    });
    if (!r.ok) throw new Error(`/v1/tts ${r.status}: ${(await r.text()).slice(0, 400)}`);
    const data = (await r.json()) as { audio_base64: string; duration_sec?: number; sample_rate?: number };
    return { wav: Buffer.from(data.audio_base64, "base64"), durationSec: data.duration_sec ?? 0, sampleRate: data.sample_rate ?? 24000 };
  }

  async speakers(): Promise<unknown> {
    const r = await fetch(`${this.baseUrl}/v1/speakers`, { headers: { "X-API-Key": this.apiKey }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`/v1/speakers ${r.status}`);
    return r.json();
  }
}
