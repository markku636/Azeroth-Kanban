// Generic SDXL keyframe graph builder (port of gen_keyframes.buildSdxl).
// Everything is a parameter — checkpoint / dims / prompts / seed — so NO theme is baked in.
import type { ApiPrompt } from "@/lib/comfyui/converter";

export interface SdxlOpts {
  ckpt: string;
  pos: string;
  neg?: string;
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  prefix?: string;
}

const DEFAULT_NEG =
  "lowres, worst quality, low quality, normal quality, bad anatomy, bad proportions, bad hands, " +
  "extra fingers, fused fingers, missing fingers, extra limbs, deformed, disfigured, mutated, " +
  "malformed face, asymmetric eyes, cross-eyed, watermark, signature, username, text, logo, " +
  "blurry, out of focus, jpeg artifacts, compression artifacts, noise, grain, oversaturated, " +
  "overexposed, duplicate, cropped, frame, border, 3d render, cgi, plastic skin";

// Mild photographic quality suffix appended (high-quality keyframe mode only) so it lifts fidelity
// without overriding the shot's described style. Kept generic — no theme/medium is forced.
export const QUALITY_SUFFIX =
  "highly detailed, sharp focus, intricate detail, professional lighting, high quality, masterpiece";

export function buildSdxl(o: SdxlOpts): ApiPrompt {
  return {
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: o.ckpt } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: o.width ?? 832, height: o.height ?? 1216, batch_size: 1 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: o.pos, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: o.neg ?? DEFAULT_NEG, clip: ["4", 1] } },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: o.seed ?? 1, steps: o.steps ?? 30, cfg: o.cfg ?? 5.5,
        sampler_name: o.sampler ?? "dpmpp_2m", scheduler: o.scheduler ?? "karras", denoise: 1.0,
        model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0],
      },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: o.prefix ?? "ts_kf", images: ["8", 0] } },
  };
}

export interface HiresOpts extends SdxlOpts {
  /** latent upscale factor for the second pass (1.5 = +50% each side; default 1.5) */
  upscaleBy?: number;
  /** second-pass sampler steps (default 20) */
  hiresSteps?: number;
  /** second-pass denoise — how much the refine pass repaints the upscaled latent (default 0.45) */
  hiresDenoise?: number;
  /** latent upscale interpolation (default "bislerp" — best for SDXL latents) */
  upscaleMethod?: string;
}

// High-quality keyframe ("hires-fix"): pass 1 generates at base res, the latent is upscaled ~1.5×,
// then pass 2 resamples at low denoise to synthesize real high-frequency detail. This is the single
// biggest visual-fidelity lever for SDXL — sharper faces/hands/textures, fewer artifacts — and every
// downstream branch (Ken-Burns still, Wan2.2 i2v, InfiniteTalk lipsync) consumes the keyframe, so the
// gain propagates through the whole pipeline. Core ComfyUI nodes only (LatentUpscale) — no upscale
// model file or custom node required, so it stays portable on any SDXL checkpoint.
export function buildSdxlHires(o: HiresOpts): ApiPrompt {
  const baseW = o.width ?? 832, baseH = o.height ?? 1216;
  const by = o.upscaleBy ?? 1.5;
  // round to /8 (SDXL latent stride) so the upscaled dims are valid
  const upW = Math.round((baseW * by) / 8) * 8, upH = Math.round((baseH * by) / 8) * 8;
  return {
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: o.ckpt } },
    "5": { class_type: "EmptyLatentImage", inputs: { width: baseW, height: baseH, batch_size: 1 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: o.pos, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: o.neg ?? DEFAULT_NEG, clip: ["4", 1] } },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: o.seed ?? 1, steps: o.steps ?? 30, cfg: o.cfg ?? 5.5,
        sampler_name: o.sampler ?? "dpmpp_2m", scheduler: o.scheduler ?? "karras", denoise: 1.0,
        model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0],
      },
    },
    "20": {
      class_type: "LatentUpscale",
      inputs: { samples: ["3", 0], upscale_method: o.upscaleMethod ?? "bislerp", width: upW, height: upH, crop: "disabled" },
    },
    "21": {
      class_type: "KSampler",
      inputs: {
        // keep the same seed family but offset so the refine pass isn't a bit-identical resample
        seed: (o.seed ?? 1) + 1, steps: o.hiresSteps ?? 20, cfg: o.cfg ?? 5.5,
        sampler_name: o.sampler ?? "dpmpp_2m", scheduler: o.scheduler ?? "karras", denoise: o.hiresDenoise ?? 0.45,
        model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["20", 0],
      },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["21", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: o.prefix ?? "ts_kf_hires", images: ["8", 0] } },
  };
}

export interface Img2ImgOpts extends SdxlOpts {
  /** bare filename already copied into ComfyUI/input (the uploaded reference image) */
  initImage: string;
  /** 0..1 — lower keeps the reference closer; ~0.5–0.6 repaints in the prompt's style while keeping the person */
  denoise?: number;
}

export interface Img2ImgHiresOpts extends Img2ImgOpts {
  /** latent upscale factor for the refine pass (default 1.5) */
  upscaleBy?: number;
  /** refine-pass steps (default 20) */
  hiresSteps?: number;
  /** refine-pass denoise (default 0.4 — gentler than txt2img hires so it keeps the reference identity) */
  hiresDenoise?: number;
  /** latent upscale interpolation (default "bislerp") */
  upscaleMethod?: string;
}

// High-quality reference-repaint keyframe (faceid path): scale the reference to a FIXED base (so the
// output resolution/VRAM is bounded regardless of how big the uploaded/portrait ref is) → VAEEncode →
// restyle KSampler at denoise<1 → latent upscale ×1.5 → refine KSampler at low denoise. Brings the
// character/faceid keyframe to the SAME fidelity as the txt2img hires path so character shots aren't
// softer than non-character shots. Core ComfyUI nodes only (ImageScale/LatentUpscale).
export function buildSdxlImg2ImgHires(o: Img2ImgHiresOpts): ApiPrompt {
  const baseW = o.width ?? 832, baseH = o.height ?? 1216;
  const by = o.upscaleBy ?? 1.5;
  const upW = Math.round((baseW * by) / 8) * 8, upH = Math.round((baseH * by) / 8) * 8;
  return {
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: o.ckpt } },
    "10": { class_type: "LoadImage", inputs: { image: o.initImage } },
    // bound the working resolution: fit the ref to the project's base keyframe dims (center-crop)
    "14": { class_type: "ImageScale", inputs: { image: ["10", 0], upscale_method: "lanczos", width: baseW, height: baseH, crop: "center" } },
    "11": { class_type: "VAEEncode", inputs: { pixels: ["14", 0], vae: ["4", 2] } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: o.pos, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: o.neg ?? DEFAULT_NEG, clip: ["4", 1] } },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: o.seed ?? 1, steps: o.steps ?? 28, cfg: o.cfg ?? 5.5,
        sampler_name: o.sampler ?? "dpmpp_2m", scheduler: o.scheduler ?? "karras", denoise: o.denoise ?? 0.55,
        model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["11", 0],
      },
    },
    "20": { class_type: "LatentUpscale", inputs: { samples: ["3", 0], upscale_method: o.upscaleMethod ?? "bislerp", width: upW, height: upH, crop: "disabled" } },
    "21": {
      class_type: "KSampler",
      inputs: {
        seed: (o.seed ?? 1) + 1, steps: o.hiresSteps ?? 20, cfg: o.cfg ?? 5.5,
        sampler_name: o.sampler ?? "dpmpp_2m", scheduler: o.scheduler ?? "karras", denoise: o.hiresDenoise ?? 0.4,
        model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["20", 0],
      },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["21", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: o.prefix ?? "ts_kf_i2i_hires", images: ["8", 0] } },
  };
}

// Reference-repaint keyframe: load the uploaded image → VAEEncode → KSampler at denoise<1 with the
// prompt. Keeps the person/composition of the reference while restyling to the shot's visual. Base
// SDXL nodes only (no IPAdapter/InsightFace dependency) so it works on any SDXL checkpoint.
export function buildSdxlImg2Img(o: Img2ImgOpts): ApiPrompt {
  return {
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: o.ckpt } },
    "10": { class_type: "LoadImage", inputs: { image: o.initImage } },
    "11": { class_type: "VAEEncode", inputs: { pixels: ["10", 0], vae: ["4", 2] } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: o.pos, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: o.neg ?? DEFAULT_NEG, clip: ["4", 1] } },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: o.seed ?? 1, steps: o.steps ?? 28, cfg: o.cfg ?? 5.5,
        sampler_name: o.sampler ?? "dpmpp_2m", scheduler: o.scheduler ?? "karras", denoise: o.denoise ?? 0.55,
        model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["11", 0],
      },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: o.prefix ?? "ts_kf_i2i", images: ["8", 0] } },
  };
}

export interface InpaintOpts extends SdxlOpts {
  /** bare filename already copied into ComfyUI/input — the base image to inpaint */
  initImage: string;
  /** bare filename of the mask in ComfyUI/input — WHITE = repaint this region, BLACK = keep untouched */
  maskImage: string;
  /** 0..1 — repaint strength inside the masked region (1.0 = fully regenerate; lower keeps more of the base) */
  denoise?: number;
  /** grow the mask edge by N px to blend the seam (default 8) */
  growMask?: number;
}

// Local inpaint ("洗圖" 局部重繪): load base image + mask → VAEEncodeForInpaint (renoises ONLY the masked
// latents) → KSampler repaints just that region toward the prompt, leaving the rest pixel-identical.
// Core ComfyUI nodes only (LoadImage / ImageToMask / VAEEncodeForInpaint) — no custom/inpaint-specific
// checkpoint required, so it works on the same juggernautXL ckpt as the other keyframe builders.
export function buildSdxlInpaint(o: InpaintOpts): ApiPrompt {
  return {
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: o.ckpt } },
    "10": { class_type: "LoadImage", inputs: { image: o.initImage } },
    "12": { class_type: "LoadImage", inputs: { image: o.maskImage } },
    "13": { class_type: "ImageToMask", inputs: { image: ["12", 0], channel: "red" } },
    "11": { class_type: "VAEEncodeForInpaint", inputs: { pixels: ["10", 0], vae: ["4", 2], mask: ["13", 0], grow_mask_by: o.growMask ?? 8 } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: o.pos, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: o.neg ?? DEFAULT_NEG, clip: ["4", 1] } },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: o.seed ?? 1, steps: o.steps ?? 28, cfg: o.cfg ?? 5.5,
        sampler_name: o.sampler ?? "dpmpp_2m", scheduler: o.scheduler ?? "karras", denoise: o.denoise ?? 1.0,
        model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["11", 0],
      },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
    "9": { class_type: "SaveImage", inputs: { filename_prefix: o.prefix ?? "ts_kf_inpaint", images: ["8", 0] } },
  };
}
