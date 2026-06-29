// ComfyUIClient — drive a local ComfyUI from TypeScript (node built-in fetch + WebSocket).
// Generic: submit a /prompt graph, stream /ws progress, resolve outputs from /history.
import { randomUUID } from "node:crypto";
import { copyFileSync } from "node:fs";
import { basename, join } from "node:path";
import WS from "ws";
import type { ApiPrompt, ObjectInfo } from "./converter";

// Node < 22 (e.g. the worker's node:20 base image) has no global WebSocket → fall back to the
// `ws` package, which implements the same browser-compatible on{open,message,error,close} API.
const WebSocketImpl: typeof WebSocket =
  (globalThis as { WebSocket?: typeof WebSocket }).WebSocket ?? (WS as unknown as typeof WebSocket);

export interface OutputFile { nodeId: string; kind: "images" | "gifs" | "videos"; filename: string; subfolder: string; type: string; path: string }

export class ComfyUIClient {
  private oiCache: ObjectInfo | null = null;
  constructor(
    private host = "127.0.0.1:8188",
    private comfyRoot = join(process.cwd(), "ComfyUI"),
  ) {}

  private base() { return `http://${this.host}`; }

  /** Copy a file into ComfyUI/input/ (LoadImage/VHS load nodes only accept input-relative names). */
  copyIntoInput(srcPath: string): string {
    const name = basename(srcPath);
    copyFileSync(srcPath, join(this.comfyRoot, "input", name));
    return name;
  }

  async objectInfo(): Promise<ObjectInfo> {
    if (this.oiCache) return this.oiCache;
    const r = await fetch(`${this.base()}/object_info`);
    if (!r.ok) throw new Error(`object_info ${r.status}`);
    this.oiCache = (await r.json()) as ObjectInfo;
    return this.oiCache;
  }

  async submit(prompt: ApiPrompt, clientId: string): Promise<string> {
    const r = await fetch(`${this.base()}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, client_id: clientId }),
    });
    if (!r.ok) throw new Error(`/prompt ${r.status}: ${(await r.text()).slice(0, 600)}`);
    return ((await r.json()) as { prompt_id: string }).prompt_id;
  }

  /** Submit + stream progress via /ws + resolve outputs from /history. */
  async run(prompt: ApiPrompt, opts: { onProgress?: (p: number) => void; timeoutMs?: number } = {}): Promise<OutputFile[]> {
    const clientId = randomUUID();
    const ws = new WebSocketImpl(`ws://${this.host}/ws?clientId=${clientId}`);
    await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error("ws open failed")); });

    const promptId = await this.submit(prompt, clientId);
    const timeoutMs = opts.timeoutMs ?? 600_000;

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`run timeout ${timeoutMs}ms`)), timeoutMs);
        ws.onmessage = (ev: MessageEvent) => {
          const d = ev.data as unknown;
          let text: string;
          if (typeof d === "string") text = d;                // global WebSocket text frame
          else if (Buffer.isBuffer(d)) {                      // `ws` may deliver text frames as Buffer
            if (d.length === 0 || d[0] !== 0x7b) return;      // not JSON ('{') → binary preview frame
            text = d.toString("utf8");
          } else return;                                      // ArrayBuffer / other binary — ignore
          const m = JSON.parse(text) as { type: string; data?: any };
          if (m.data?.prompt_id && m.data.prompt_id !== promptId) return;
          if (m.type === "progress" && m.data) opts.onProgress?.(m.data.value / m.data.max);
          if (m.type === "executing" && m.data && m.data.node === null) { clearTimeout(timer); resolve(); }
          if (m.type === "execution_error") { clearTimeout(timer); reject(new Error(JSON.stringify(m.data).slice(0, 600))); }
        };
        ws.onerror = () => { clearTimeout(timer); reject(new Error("ws error")); };
      });
    } finally {
      ws.onmessage = null; ws.onerror = null; ws.onopen = null;
      try { ws.close(); } catch { /* already closing */ }
    }

    const hist = (await (await fetch(`${this.base()}/history/${promptId}`)).json()) as Record<string, { outputs: Record<string, any> }>;
    const entry = hist[promptId];
    if (!entry) throw new Error("no history entry");
    const out: OutputFile[] = [];
    for (const [nodeId, ov] of Object.entries(entry.outputs)) {
      for (const kind of ["images", "gifs", "videos"] as const) {
        for (const f of (ov[kind] ?? [])) {
          // ComfyUI on Windows reports subfolder with backslashes → normalize so paths resolve on the Linux worker.
          const subfolder = (f.subfolder ?? "").replace(/\\/g, "/");
          out.push({
            nodeId, kind, filename: f.filename, subfolder, type: f.type ?? "output",
            // 一律用 comfyRoot 重建路徑（不採 ComfyUI 回的 fullpath）：容器內 fullpath 是主機路徑、讀不到。
            path: join(this.comfyRoot, f.type === "input" ? "input" : "output", subfolder, f.filename),
          });
        }
      }
    }
    return out;
  }
}
