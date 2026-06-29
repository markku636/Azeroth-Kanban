// Wan2.2 i2v adapter — keyframe image → motion video clip, via converter + profile (generic).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ComfyUIClient } from "@/lib/comfyui/client";
import type { OutputFile } from "@/lib/comfyui/client";
import { PROFILES, buildPrompt } from "@/lib/comfyui/profiles";
import type { Workflow } from "@/lib/comfyui/converter";

export async function i2v(
  client: ComfyUIClient,
  opts: { image: string; motion: string; prefix: string; profileId?: string; onProgress?: (p: number) => void },
): Promise<OutputFile[]> {
  const profile = PROFILES[opts.profileId ?? "wan22-i2v-fast"];
  const comfyDir = process.env.COMFYUI_DIR ?? join(process.cwd(), "ComfyUI");
  const wf = JSON.parse(readFileSync(join(comfyDir, profile.workflowPath.replace(/^ComfyUI[\\/]/, "")), "utf8")) as Workflow;
  const oi = await client.objectInfo();
  const inName = client.copyIntoInput(opts.image);                       // LoadImage needs an input-relative name
  const prompt = buildPrompt(profile, wf, oi, { image: inName, prompt: opts.motion, outputPrefix: opts.prefix });
  return client.run(prompt, { onProgress: opts.onProgress, timeoutMs: profile.timeoutMs });
}
