// WorkflowProfile registry — makes the ComfyUI node-id contracts DATA, not hardcoded.
// Swapping a workflow / model / theme = add or pick a profile; the engine code never changes.
import { convert, prune } from "./converter";
import type { ApiPrompt, ObjectInfo, Workflow } from "./converter";

export interface WorkflowProfile {
  id: string;
  kind: "lipsync" | "i2v" | "keyframe" | "custom";
  workflowPath: string;                 // relative to ComfyUI root (or absolute)
  nodes: {
    image?: string;                     // LoadImage node id
    audio?: string;                     // audio load node id
    prompt?: string;                    // positive-prompt node id
    promptField?: "value" | "text";     // the input field on the prompt node
    output?: string;                    // VHS_VideoCombine node id
  };
  timeoutMs: number;
}

// The two proven local workflows — registered as data. Add more here for new themes/models.
export const PROFILES: Record<string, WorkflowProfile> = {
  "infinitetalk-single": {
    id: "infinitetalk-single",
    kind: "lipsync",
    workflowPath: "ComfyUI/user/default/workflows/3、数字人合集/最新infinitetalk单人图片数字人KJ版.json",
    nodes: { image: "133", audio: "209", prompt: "200", promptField: "value", output: "131" },
    timeoutMs: 3_600_000, // InfiniteTalk on 16GB (block-swap + 3-window sampling + VAE) is slow — allow 60 min/shot
  },
  "wan22-i2v-fast": {
    id: "wan22-i2v-fast",
    kind: "i2v",
    workflowPath: "ComfyUI/user/default/workflows/4、视频工作流Wan2.2/最新wan2.2-14B图生视频官方极速版，效果炸裂.json",
    nodes: { image: "97", prompt: "93", promptField: "text", output: "118" },
    timeoutMs: 900_000,
  },
};

export interface BuildInputs {
  image?: string;        // bare filename in ComfyUI/input
  audio?: string;        // bare filename in ComfyUI/input
  prompt?: string;       // positive prompt text
  outputPrefix?: string; // VHS filename_prefix
}

/** Convert a UI workflow to an API prompt and apply role-based overrides via the profile. Generic. */
export function buildPrompt(profile: WorkflowProfile, wf: Workflow, oi: ObjectInfo, inputs: BuildInputs): ApiPrompt {
  const prompt = prune(convert(wf, oi), oi);
  const n = profile.nodes;
  const set = (nodeId: string | undefined, field: string, val: unknown) => {
    if (nodeId && prompt[nodeId]) (prompt[nodeId].inputs as Record<string, unknown>)[field] = val;
  };
  if (inputs.image !== undefined) set(n.image, "image", inputs.image);
  if (inputs.audio !== undefined) set(n.audio, "audio", inputs.audio);
  if (inputs.prompt !== undefined) set(n.prompt, n.promptField ?? "value", inputs.prompt);
  if (inputs.outputPrefix !== undefined) set(n.output, "filename_prefix", inputs.outputPrefix);
  return prompt;
}
