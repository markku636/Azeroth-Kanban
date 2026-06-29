// InfiniteTalk lipsync adapter — keyframe (face) + voice audio → talking-head video, via converter + profile.
// Generic: node-id contract lives in the profile (133 image / 209 audio / 200 prompt / 131 output).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ComfyUIClient } from "@/lib/comfyui/client";
import type { OutputFile } from "@/lib/comfyui/client";
import { PROFILES, buildPrompt } from "@/lib/comfyui/profiles";
import type { Workflow } from "@/lib/comfyui/converter";

export async function lipsync(
  client: ComfyUIClient,
  opts: { image: string; audio: string; prompt?: string; prefix: string; profileId?: string; onProgress?: (p: number) => void },
): Promise<OutputFile[]> {
  const profile = PROFILES[opts.profileId ?? "infinitetalk-single"];
  // workflowPath is "ComfyUI/user/..."; resolve against the real ComfyUI dir (mounted at /comfyui in the worker).
  const comfyDir = process.env.COMFYUI_DIR ?? join(process.cwd(), "ComfyUI");
  const wf = JSON.parse(readFileSync(join(comfyDir, profile.workflowPath.replace(/^ComfyUI[\\/]/, "")), "utf8")) as Workflow;
  const oi = await client.objectInfo();
  const inImage = client.copyIntoInput(opts.image);   // LoadImage(133) needs an input-relative name
  const inAudio = client.copyIntoInput(opts.audio);   // VHS_LoadAudioUpload(209) needs an input-relative name
  const prompt = buildPrompt(profile, wf, oi, { image: inImage, audio: inAudio, prompt: opts.prompt, outputPrefix: opts.prefix });
  return client.run(prompt, { onProgress: opts.onProgress, timeoutMs: profile.timeoutMs });
}
