// Staged, crash-safe studio pipeline — runs ONE shot at a time and calls ComfyUI /free between heavy
// steps (prevents the VRAM/RAM accumulation that can crash the box on consecutive InfiniteTalk runs).
// Bypasses the LangGraph checkpoint flow: the new two-phase UI ("① 生成圖片" / "② 生成影片") drives these.
// Reads intent from the DB (so user edits + uploaded reference images are honoured) and writes artifacts
// to studio_storage; mirrors graph.ts's per-shot branch logic and assemble.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Shot } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ComfyUIClient } from '@/lib/comfyui/client';
import { buildSdxl, buildSdxlHires, buildSdxlImg2Img, buildSdxlImg2ImgHires, buildSdxlInpaint, QUALITY_SUFFIX } from '@/lib/engine/keyframe';
import { SealTTSClient, normalizeTtsText } from '@/lib/engine/voiceover';
import { Compositor, probeDuration, trimSilence, type SubStyle } from '@/lib/engine/assemble';
import { sfxFile, type SfxName } from '@/lib/engine/sfx';
import { i2v } from '@/lib/engine/i2v';
import { lipsync } from '@/lib/engine/lipsync';
import { makePad } from '@/lib/engine/music';
import { moodFromProject } from './mood';
import { publishProgress } from './events';

const COMFY_HOST = (process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188').replace(/^https?:\/\//, '');
const COMFY_DIR = process.env.COMFYUI_DIR ?? join(process.cwd(), 'ComfyUI');
const SEAL_URL = process.env.SEAL_TTS_URL ?? 'http://192.168.50.57:7866';
const SEAL_KEY = process.env.SEAL_TTS_API_KEY ?? '';
const STORAGE = process.env.STUDIO_STORAGE_ROOT ?? join(process.cwd(), 'studio-storage');
const CKPT = process.env.STUDIO_SDXL_CKPT ?? 'juggernautXL_v9_V9 + RDPhoto 2.safetensors';
const FFMPEG = process.env.FFMPEG_BIN ?? 'ffmpeg';
// High-quality keyframes via hires-fix (two-pass latent-upscale refine). Default ON — set
// STUDIO_KEYFRAME_HIRES=false to fall back to the faster single-pass txt2img.
const KF_HIRES = (process.env.STUDIO_KEYFRAME_HIRES ?? 'true').toLowerCase() !== 'false';

const projectDir = (pid: string) => join(STORAGE, 'projects', pid);
const shotDir = (pid: string, sid: string) => join(projectDir(pid), 'shots', sid);
const shotClip = (pid: string, sid: string) => join(shotDir(pid, sid), 'clip.mp4');
const historyDir = (pid: string, sid: string) => join(shotDir(pid, sid), 'history');
const sceneOutputDir = (pid: string, scid: string) => join(projectDir(pid), 'scenes', scid);

let _comfy: ComfyUIClient | null = null;
const comfy = () => (_comfy ??= new ComfyUIClient(COMFY_HOST, COMFY_DIR));
const comp = new Compositor();

/**
 * 把剛產生的成品（關鍵幀 / 影片）另存一份不被覆寫的歷史快照，並寫一筆 Version 記錄，
 * 供「查看歷史」UI 列出每次重生的版本。canonical 檔（keyframe.png / clip.mp4）仍是最新版，
 * 此處只是「另外」留底。任何 IO/DB 例外都吞掉——絕不讓留歷史這件事弄壞一次生成。
 */
async function recordVersion(
  shot: Shot, projectId: string, stage: 'keyframe' | 'video', srcPath: string, meta?: Record<string, unknown>,
): Promise<string | null> {
  try {
    if (!srcPath || !existsSync(srcPath)) return null;
    const dir = historyDir(projectId, shot.id);
    mkdirSync(dir, { recursive: true });
    const ext = stage === 'video' ? 'mp4' : 'png';
    const dest = join(dir, `${stage}_${Date.now()}.${ext}`);
    copyFileSync(srcPath, dest);
    const v = await prisma.version.create({
      data: { shotId: shot.id, stage, path: dest, ownerId: shot.ownerId, meta: (meta ?? undefined) as never },
    });
    return v.id;
  } catch (e) {
    console.warn('[stages.recordVersion] best-effort failed', { shotId: shot.id, stage }, e);
    return null;
  }
}

/** Unload models + free VRAM/RAM between heavy steps — the key crash-prevention. Best-effort. */
async function freeComfy(): Promise<void> {
  try {
    await fetch(`http://${COMFY_HOST}/free`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
  } catch { /* best-effort */ }
}

/** Loop/trim an audio file to exactly `dur` seconds (for project BGM shorter than the video). */
function loopAudioTo(src: string, dur: number, out: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-y', '-stream_loop', '-1', '-i', src, '-t', String(dur), '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', out], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`loopAudio exit ${c}: ${err.slice(-300)}`))));
    p.on('error', reject);
  });
}

async function loadTargets(projectId: string, shotIds?: string[]): Promise<Shot[]> {
  return prisma.shot.findMany({
    where: { projectId, ...(shotIds && shotIds.length ? { id: { in: shotIds } } : {}) },
    orderBy: { sortOrder: 'asc' },
  });
}

const reget = (id: string) => prisma.shot.findUniqueOrThrow({ where: { id } });

/**
 * 由專案畫幅 + 成片品質算出 SDXL 關鍵幀基底尺寸與成片畫布尺寸。
 * 關鍵幀尺寸（kfW/kfH）固定為 SDXL 最佳基底（hires-fix 再放大），不隨品質改變。
 * 成片畫布：**只有明確 'high'** → 1080p 級；其餘（含空值／'standard'）= 720p 級（與舊行為相同，zero regression）。
 * 既有專案 renderQuality=null → 沿用 720p（避免用舊的非-hires 關鍵幀放大到 1080p 反而變糊）；新專案 createProject 設 'high'。
 * 9:16 = 預設；另支援 16:9、1:1。未知 aspect 退回 9:16。
 */
function dimsForAspect(aspect: string, quality?: string | null): { kfW: number; kfH: number; cw: number; ch: number } {
  const hi = quality === 'high'; // 僅明確 high → 1080p；null/standard → 720p（零回歸）
  switch (aspect) {
    case '16:9': return { kfW: 1216, kfH: 832, cw: hi ? 1920 : 1280, ch: hi ? 1080 : 720 };
    case '1:1': return { kfW: 1024, kfH: 1024, cw: hi ? 1536 : 1024, ch: hi ? 1536 : 1024 };
    case '9:16':
    default: return { kfW: 832, kfH: 1216, cw: hi ? 1080 : 720, ch: hi ? 1920 : 1280 };
  }
}

/** 單次查詢拿到專案的畫幅＋品質 → 算好的關鍵幀/畫布尺寸。 */
async function projectDims(projectId: string): Promise<{ kfW: number; kfH: number; cw: number; ch: number }> {
  const p = await prisma.studioProject.findUnique({ where: { id: projectId }, select: { aspect: true, renderQuality: true } });
  return dimsForAspect(p?.aspect ?? '9:16', p?.renderQuality);
}

/** 讀專案字幕圖層樣式（fontSize/color/position）；無設定回 undefined（走引擎預設）。 */
async function projectSubStyle(projectId: string): Promise<SubStyle | undefined> {
  const p = await prisma.studioProject.findUnique({ where: { id: projectId }, select: { subtitleStyle: true } });
  const s = p?.subtitleStyle as { fontSize?: unknown; color?: unknown; position?: unknown; segment?: unknown; plate?: unknown } | null;
  if (!s || typeof s !== 'object') return undefined;
  const pos = s.position;
  return {
    fontSize: typeof s.fontSize === 'number' ? s.fontSize : undefined,
    color: typeof s.color === 'string' ? s.color : undefined,
    position: pos === 'top' || pos === 'center' || pos === 'bottom' ? pos : undefined,
    segment: s.segment === true,
    plate: s.plate === true,
  };
}

// ─────────────────────────── Keyframe ───────────────────────────
/** 指派角色的 appearance（魔法棒優化的英文視覺 prompt）+ shot.visual 合併成 SDXL 正向提示；appearance 領頭做 identity 錨點。未指派角色→空字串、行為不變（向後相容）。 */
async function mergeAppearance(shot: Shot): Promise<string> {
  let appearance = '';
  if (shot.characterId) {
    const c = await prisma.character.findUnique({ where: { id: shot.characterId }, select: { appearance: true } });
    appearance = c?.appearance?.trim() ?? '';
  }
  return [appearance, shot.visual?.trim()].filter(Boolean).join(', ');
}

/**
 * i2v 動態提示：有寫 motion 就尊重它；沒寫時別只丟靜態場景描述（Wan2.2 會幾乎不動），
 * 改成「場景 + 輕度自然運鏡」提示，確保產出有可見但不浮誇的動態。
 */
function i2vMotionPrompt(shot: Shot): string {
  const m = shot.motion?.trim();
  if (m) return m;
  const v = shot.visual?.trim();
  return [v, 'subtle natural motion, gentle camera movement, cinematic'].filter(Boolean).join(', ');
}

export async function generateKeyframe(shot: Shot, projectId: string): Promise<string | undefined> {
  const dir = shotDir(projectId, shot.id);
  mkdirSync(dir, { recursive: true });
  // upload-direct: the uploaded image IS the keyframe — nothing to generate
  if (shot.keyframeMode === 'upload' && shot.keyframePath && existsSync(shot.keyframePath)) {
    await publishProgress({ projectId, shotId: shot.id, stage: 'keyframe', status: 'done' });
    return shot.keyframePath;
  }
  await publishProgress({ projectId, shotId: shot.id, stage: 'keyframe', status: 'running' });
  // Fresh random seed every run so re-pressing「生圖」produces a NEW variation. A fixed
  // per-shot seed (+ same prompt + same model) renders a bit-identical image → looks unchanged.
  const seed = Math.floor(Math.random() * 2_147_483_647);
  const { kfW, kfH } = await projectDims(projectId);
  // 角色一致性：把指派角色的 appearance 併進 SDXL 正向提示（領頭），未指派角色時等同原本的 shot.visual。
  const pos = await mergeAppearance(shot);
  let prompt;
  if (shot.keyframeMode === 'faceid' && shot.refImage && existsSync(shot.refImage)) {
    const inRef = comfy().copyIntoInput(shot.refImage); // bare filename in ComfyUI/input
    // 高品質模式：角色/faceid 重繪也走 hires（縮放參考到固定基底→重繪→放大→refine），與 txt2img hires 同級銳利度。
    prompt = KF_HIRES
      ? buildSdxlImg2ImgHires({ ckpt: CKPT, pos: [pos, QUALITY_SUFFIX].filter(Boolean).join(', '), initImage: inRef, denoise: 0.55, seed, width: kfW, height: kfH, prefix: `studio/${projectId}/kf_${shot.id}` })
      : buildSdxlImg2Img({ ckpt: CKPT, pos, initImage: inRef, denoise: 0.55, seed, width: kfW, height: kfH, prefix: `studio/${projectId}/kf_${shot.id}` });
  } else if (KF_HIRES) {
    // 高品質：兩段 hires-fix（latent 放大 ×1.5 後低 denoise 重採樣），細節/銳利度大幅提升。
    prompt = buildSdxlHires({ ckpt: CKPT, pos: [pos, QUALITY_SUFFIX].filter(Boolean).join(', '), seed, width: kfW, height: kfH, prefix: `studio/${projectId}/kf_${shot.id}` });
  } else {
    prompt = buildSdxl({ ckpt: CKPT, pos: [pos, QUALITY_SUFFIX].filter(Boolean).join(', '), seed, width: kfW, height: kfH, prefix: `studio/${projectId}/kf_${shot.id}` });
  }
  const out = await comfy().run(prompt, { onProgress: (p) => void publishProgress({ projectId, shotId: shot.id, stage: 'keyframe', pct: p }) });
  const raw = out[0]?.path ?? '';
  let kfPath = raw;
  try {
    const dest = join(dir, 'keyframe.png');
    if (raw && existsSync(raw)) { copyFileSync(raw, dest); kfPath = dest; }
  } catch { /* keep raw */ }
  const kind = shot.keyframeMode === 'faceid' ? 'img2img' : 'txt2img';
  const verId = await recordVersion(shot, projectId, 'keyframe', kfPath, { kind, mode: shot.keyframeMode, seed });
  // 新生圖即為現役版本：把 selectedKeyframeId 指向這次的版本（覆蓋先前手動挑選的舊版指向）。
  await prisma.shot.update({ where: { id: shot.id }, data: { keyframePath: kfPath, status: 'KEYFRAME', selectedKeyframeId: verId } });
  await publishProgress({ projectId, shotId: shot.id, stage: 'keyframe', status: 'done' });
  return kfPath;
}

// ─────────────────────────── Character portrait（角色形象圖：AI 生成）───────────────────────────
const charDir = (cid: string) => join(STORAGE, 'characters', cid);

/**
 * 用角色 appearance（+可選補充）以 SDXL txt2img 生成角色形象圖，存進角色庫並設為 FaceID 主圖＋縮圖。
 * 與「上傳形象圖」(reference route) 殊途同歸：都寫到 STORAGE/characters/<id>/ 並 push 進 refImages。
 */
export async function runCharacterPortraitStage(characterId: string, prompt?: string): Promise<string | undefined> {
  const ch = await prisma.character.findUnique({ where: { id: characterId } });
  if (!ch) return undefined;
  const pos = [
    ch.appearance?.trim(),
    prompt?.trim(),
    'solo character portrait, upper body, facing camera, clean plain background, sharp focus, highly detailed',
  ].filter(Boolean).join(', ');
  if (!pos.trim()) return undefined;
  const seed = Math.floor(Math.random() * 2_147_483_647);
  // 角色形象圖是 FaceID 一致性的根基 → 也走 hires-fix（高品質模式時），讓參考臉更清晰。
  const gprompt = KF_HIRES
    ? buildSdxlHires({ ckpt: CKPT, pos: [pos, QUALITY_SUFFIX].filter(Boolean).join(', '), seed, width: 896, height: 1152, prefix: `studio/characters/${characterId}` })
    : buildSdxl({ ckpt: CKPT, pos, seed, width: 896, height: 1152, prefix: `studio/characters/${characterId}` });
  let out;
  try {
    out = await comfy().run(gprompt);
  } finally {
    await freeComfy(); // 生完卸模型釋顯存（與分鏡生圖一致）
  }
  const raw = out?.[0]?.path ?? '';
  if (!raw || !existsSync(raw)) return undefined;
  const dir = charDir(characterId);
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `gen_${Date.now()}.png`);
  copyFileSync(raw, dest);
  const existing = Array.isArray(ch.refImages) ? (ch.refImages as unknown[]).filter((v): v is string => typeof v === 'string') : [];
  // 生成的圖設為現役 FaceID 主圖 + 角色縮圖（覆蓋舊主圖；舊圖仍留在 refImages）。
  await prisma.character.update({
    where: { id: characterId },
    data: { refImages: [...existing, dest], faceIdRef: dest, avatarPath: dest },
  });
  return dest;
}

// ─────────────────────────── Refine（洗圖：img2img 微調 / inpaint 局部重繪）───────────────────────────
export interface RefinePayload {
  shotId: string;
  refineMode: 'img2img' | 'inpaint';
  instruction?: string;
  denoise?: number;
  baseVersionId?: string;
  maskPath?: string;
}

/**
 * 洗圖：在現有關鍵幀上做 img2img 微調或 inpaint 局部重繪，產出「新版本」記入 Version 歷史，
 * 但**不**覆蓋現役 keyframe.png / selectedKeyframeId — 由使用者在 UI 比較前後後再 select。
 * 回傳新版本的 Version.id。
 */
export async function generateRefine(projectId: string, payload: RefinePayload): Promise<string | undefined> {
  const shot = await prisma.shot.findUnique({ where: { id: payload.shotId } });
  if (!shot) return undefined;
  await publishProgress({ projectId, shotId: shot.id, stage: 'keyframe', status: 'running', message: '洗圖中…' });

  // 基底圖：指定版本 → 該版本檔；否則現役 keyframe.png。
  let basePath = shot.keyframePath ?? '';
  if (payload.baseVersionId) {
    const bv = await prisma.version.findFirst({ where: { id: payload.baseVersionId, shotId: shot.id }, select: { path: true } });
    if (bv?.path && existsSync(bv.path)) basePath = bv.path;
  }
  if (!basePath || !existsSync(basePath)) {
    await publishProgress({ projectId, shotId: shot.id, stage: 'keyframe', status: 'error', message: '找不到可洗的基底圖，請先「① 生圖」' });
    return undefined;
  }

  const seed = Math.floor(Math.random() * 2_147_483_647);
  // 洗圖也帶入角色 appearance（領頭），再接洗圖指令；空段自動略過避免多餘逗號。
  const basePos = await mergeAppearance(shot);
  const pos = [basePos, payload.instruction?.trim()].filter(Boolean).join(', ');
  const inBase = comfy().copyIntoInput(basePath);
  const useInpaint = payload.refineMode === 'inpaint' && !!payload.maskPath && existsSync(payload.maskPath);
  const denoise = payload.denoise ?? (useInpaint ? 0.9 : 0.45);

  let prompt;
  if (useInpaint && payload.maskPath) {
    const inMask = comfy().copyIntoInput(payload.maskPath);
    prompt = buildSdxlInpaint({ ckpt: CKPT, pos, initImage: inBase, maskImage: inMask, denoise, seed, prefix: `studio/${projectId}/refine_${shot.id}` });
  } else {
    prompt = buildSdxlImg2Img({ ckpt: CKPT, pos, initImage: inBase, denoise, seed, prefix: `studio/${projectId}/refine_${shot.id}` });
  }
  const out = await comfy().run(prompt, { onProgress: (p) => void publishProgress({ projectId, shotId: shot.id, stage: 'keyframe', pct: p }) });
  const raw = out[0]?.path ?? '';
  if (!raw || !existsSync(raw)) {
    await publishProgress({ projectId, shotId: shot.id, stage: 'keyframe', status: 'error', message: '洗圖未產生輸出' });
    return undefined;
  }
  // 記為新版本（不選為現役）。meta 帶上洗圖脈絡，供 UI 顯示徽章與來源。
  const verId = await recordVersion(shot, projectId, 'keyframe', raw, {
    kind: useInpaint ? 'inpaint' : 'img2img',
    instruction: payload.instruction?.trim() || null,
    denoise, seed,
    parentVersionId: payload.baseVersionId ?? shot.selectedKeyframeId ?? null,
    hasMask: useInpaint,
  });
  await publishProgress({ projectId, shotId: shot.id, stage: 'keyframe', status: 'done', message: '洗圖完成，請比較前後再採用' });
  return verId ?? undefined;
}

// ─────────────────────────── Voice ───────────────────────────
export async function generateVoice(shot: Shot, projectId: string): Promise<string | undefined> {
  if (!shot.tts) return shot.voiceWav ?? undefined;
  await publishProgress({ projectId, shotId: shot.id, stage: 'voice', status: 'running' });
  const tts = new SealTTSClient(SEAL_URL, SEAL_KEY);
  // 指派角色時，沿用角色的 cosyvoice3 lora_scale / 引擎 / 預設語氣（shot.emotion 優先覆寫）。
  const character = shot.characterId ? await prisma.character.findUnique({ where: { id: shot.characterId } }) : null;
  let r;
  try {
    r = await tts.synth({
      speaker: shot.speaker ?? 'default',
      text: shot.tts,
      instruct: shot.emotion ?? character?.voiceInstruct ?? undefined,
      loraScale: character?.loraScale ?? undefined,
      engine: character?.ttsEngine ?? undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 把 undici 的原始「fetch failed」換成可行動的訊息（最常見：TTS 伺服器沒開機/未啟動）。
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|timed?\s*out|aborted/i.test(msg)) {
      throw new Error(`配音伺服器(Seal-TTS)連線失敗：${SEAL_URL} 無回應，請先確認 TTS 服務已啟動再生成影片。（原始：${msg}）`);
    }
    throw e;
  }
  const dir = shotDir(projectId, shot.id);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'voice.wav');
  writeFileSync(p, r.wav);
  // 去掉旁白前後的靜音（保留句中停頓）→ 卡點更緊、鉤子更快到、pop-on 字幕更貼齊真實語音。
  // 安全網：只在有實際削減、且削後仍保留 ≥55% 原長（避免異常過削整段）時才替換；否則保留原檔。可用 STUDIO_TRIM_SILENCE=off 關閉。
  if ((process.env.STUDIO_TRIM_SILENCE ?? 'on').toLowerCase() !== 'off') {
    const tmp = join(dir, 'voice_trim.wav');
    try {
      const raw0 = await probeDuration(p);
      const d1 = await trimSilence(p, tmp);
      if (d1 > 0.1 && raw0 > 0 && d1 < raw0 - 0.03 && d1 >= raw0 * 0.55) copyFileSync(tmp, p);
    } catch { /* 保留原始配音 */ }
    try { unlinkSync(tmp); } catch { /* 沒產生暫存檔就略過 */ } // 不留下 voice_trim.wav 殘檔
  }
  await prisma.shot.update({ where: { id: shot.id }, data: { voiceWav: p, status: 'VOICE' } });
  await publishProgress({ projectId, shotId: shot.id, stage: 'voice', status: 'done' });
  return p;
}

// ─────────────────────────── Video (mirrors graph.ts genVideo branches) ───────────────────────────
export async function generateVideo(shot: Shot, projectId: string): Promise<string | undefined> {
  const dir = shotDir(projectId, shot.id);
  mkdirSync(dir, { recursive: true });
  const clip = shotClip(projectId, shot.id);
  const keyframe = shot.keyframePath ?? undefined;
  const voice = shot.voiceWav ?? undefined;
  const isComedy = Boolean(shot.caption || shot.punchline || (shot.sfx && shot.sfx !== 'none') || shot.punch);
  const { cw, ch } = await projectDims(projectId);
  const subStyle = await projectSubStyle(projectId);
  // 燒進畫面的文字也正規化（去 markdown/收斂空白），與 R24 送 TTS 的清理一致 → 「聽到的」與「看到的」都乾淨。
  const cap = shot.caption ? normalizeTtsText(shot.caption) || undefined : undefined;
  const punch = shot.punchline ? normalizeTtsText(shot.punchline) || undefined : undefined;
  const sub = shot.subtitle ? normalizeTtsText(shot.subtitle) || undefined : undefined;
  const subOrTts = normalizeTtsText(shot.subtitle ?? shot.tts ?? '') || undefined;
  let produced = false;

  if (shot.branch === 'lip' && keyframe && voice) {
    await publishProgress({ projectId, shotId: shot.id, stage: 'video', status: 'running' });
    const talk = await lipsync(comfy(), {
      image: keyframe, audio: voice, prompt: shot.subtitle || shot.tts || '',
      prefix: `studio/${projectId}/lip_${shot.id}`,
      onProgress: (p) => void publishProgress({ projectId, shotId: shot.id, stage: 'video', pct: p }),
    });
    if (isComedy) {
      const dur = await probeDuration(voice);
      const punchAt = shot.punch || shot.punchline ? +(dur * (shot.punchAtFrac ?? 0.55)).toFixed(2) : undefined;
      await comp.memeMotionShot({ clip: talk[0].path, voice, out: clip, width: cw, height: ch, topCaption: cap, bottomCaption: punch, punchAt });
    } else {
      await comp.motionShot({ clip: talk[0].path, voice, out: clip, width: cw, height: ch, subtitle: sub, subStyle });
    }
    await prisma.shot.update({ where: { id: shot.id }, data: { lipsyncMp4: clip, status: 'VIDEO' } });
    produced = true;
  } else if (isComedy && shot.branch === 'i2v' && keyframe) {
    // 喜劇 + 明確選 i2v：真動態背景 + 迷因大字幕（取代靜態 memeStill）。有無配音都能生。
    await publishProgress({ projectId, shotId: shot.id, stage: 'video', status: 'running' });
    const fbDur = 3.5;
    const motion = await i2v(comfy(), {
      image: keyframe, motion: i2vMotionPrompt(shot), prefix: `studio/${projectId}/i2v_${shot.id}`,
      onProgress: (p) => void publishProgress({ projectId, shotId: shot.id, stage: 'video', pct: p }),
    });
    const dur = voice ? await probeDuration(voice) : fbDur;
    const punchAt = shot.punch || shot.punchline ? +(dur * (shot.punchAtFrac ?? 0.55)).toFixed(2) : undefined;
    await comp.memeMotionShot({
      clip: motion[0].path, voice, out: clip, fallbackDur: fbDur, width: cw, height: ch,
      topCaption: cap, bottomCaption: punch, punchAt,
    });
    await prisma.shot.update({ where: { id: shot.id }, data: { i2vMp4: clip, status: 'VIDEO' } });
    produced = true;
  } else if (isComedy && keyframe) {
    await publishProgress({ projectId, shotId: shot.id, stage: 'video', status: 'running' });
    const fbDur = 3.5;
    const dur = voice ? await probeDuration(voice) : fbDur;
    const punchAt = shot.punch || shot.punchline ? +(dur * (shot.punchAtFrac ?? 0.55)).toFixed(2) : undefined;
    await comp.memeStill({
      image: keyframe, voice, out: clip, fallbackDur: fbDur, width: cw, height: ch,
      topCaption: cap, bottomCaption: punch,
      punchAt, punchZoom: shot.punch ? (shot.punchZoom ?? 1.9) : undefined,
    });
    await prisma.shot.update({ where: { id: shot.id }, data: { status: 'VIDEO' } });
    produced = true;
  } else if (shot.branch === 'i2v' && keyframe) {
    // 真實動態(i2v)：有無配音都能生（無 voice → 走 fallbackDur 的靜音床，供尚未配音的動態 B-roll）。
    await publishProgress({ projectId, shotId: shot.id, stage: 'video', status: 'running' });
    const motion = await i2v(comfy(), {
      image: keyframe, motion: i2vMotionPrompt(shot), prefix: `studio/${projectId}/i2v_${shot.id}`,
      onProgress: (p) => void publishProgress({ projectId, shotId: shot.id, stage: 'video', pct: p }),
    });
    await comp.motionShot({ clip: motion[0].path, voice, out: clip, width: cw, height: ch, subtitle: sub, subStyle, fallbackDur: 4.0 });
    await prisma.shot.update({ where: { id: shot.id }, data: { i2vMp4: clip, status: 'VIDEO' } });
    produced = true;
  } else if (keyframe && voice) {
    await comp.still({ image: keyframe, voice, out: clip, width: cw, height: ch, subtitle: subOrTts, subStyle, motionSeed: shot.shotNo });
    await prisma.shot.update({ where: { id: shot.id }, data: { status: 'VIDEO' } });
    produced = true;
  }
  if (produced) await recordVersion(shot, projectId, 'video', clip, { branch: shot.branch });
  await publishProgress({ projectId, shotId: shot.id, stage: 'video', status: 'done' });
  return produced ? clip : undefined;
}

// ─────────────────────────── Assemble core（任意一組分鏡 → outDir/final.mp4）───────────────────────────
async function assembleClips(projectId: string, shots: Shot[], outDir: string): Promise<string> {
  mkdirSync(outDir, { recursive: true });

  const present = shots.filter((s) => existsSync(shotClip(projectId, s.id)));
  const clips = present.map((s) => shotClip(projectId, s.id));
  if (clips.length === 0) throw new Error('assemble: 沒有任何分鏡 clip（請先生成影片）');
  // Scene-aware seam transitions: hard cut at a punchline (comedic snap); a cinematic dip-to-black
  // when the scene changes (clear story-beat delineation); gentle crossfade within a scene. The fades
  // array keeps the same length/semantics as before so the SFX-start math below is unaffected.
  const fades: number[] = [];
  const transitions: string[] = [];
  for (let i = 1; i < present.length; i++) {
    const prev = present[i - 1], cur = present[i];
    if (cur.punch || cur.punchline) { fades.push(0); transitions.push('fade'); }       // comedic snap
    else if (prev.sceneId !== cur.sceneId) { fades.push(0.5); transitions.push('fadeblack'); } // scene change
    else { fades.push(0.25); transitions.push('fade'); }                                // within scene
  }

  await publishProgress({ projectId, stage: 'assemble', status: 'running', message: '合成：套用場景轉場…' });
  const body = join(outDir, 'body.mp4');
  await comp.stitch({ clips, out: body, fades, transitions });

  let videoOut = body;
  if (present.some((s) => s.sfx && s.sfx !== 'none')) {
    const durs = await Promise.all(clips.map((c) => probeDuration(c)));
    // SFX cue times must be measured on the SAME timeline stitch produces. stitch() collapses to a
    // hard-cut concat only when EVERY seam is hard; otherwise it clamps each seam (incl. hard cuts) to
    // ≥2 frames of xfade. Mirror that here, else zaps drift ~2/30s late per hard seam before the cue.
    const allHard = fades.every((f) => f <= 0);
    const minFade = 2 / 30;
    const starts = [0];
    for (let i = 1; i < clips.length; i++) {
      const f = allHard ? 0 : Math.max(fades[i - 1], minFade);
      starts.push(starts[i - 1] + durs[i - 1] - f);
    }
    const cues = present
      .map((s, i) => ({ s, i }))
      .filter((x) => x.s.sfx && x.s.sfx !== 'none')
      .map((x) => ({ sfx: sfxFile(x.s.sfx as SfxName, join(outDir, 'sfx')), atSec: +(starts[x.i] + durs[x.i] * (x.s.punchAtFrac ?? 0.55)).toFixed(2), gain: 0.8 }));
    await publishProgress({ projectId, stage: 'assemble', status: 'running', message: '合成：加入音效卡點…' });
    const withSfx = join(outDir, 'body_sfx.mp4');
    await comp.mixSfx({ video: body, cues, out: withSfx });
    videoOut = withSfx;
  }

  const dur = await probeDuration(videoOut);
  const project = await prisma.studioProject.findUnique({ where: { id: projectId } });
  const mood = moodFromProject(project, shots); // tone/genre 明確用之(零回歸)；否則用分鏡情緒多數決補
  const bgm = join(outDir, 'bgm.wav');
  if (project?.bgmPath && existsSync(project.bgmPath)) {
    await loopAudioTo(project.bgmPath, +(dur + 0.5).toFixed(2), bgm); // 使用者上傳的 BGM，循環/裁切到片長
  } else {
    writeFileSync(bgm, makePad(dur + 0.5, { gain: 0.8, mood })); // 預設：依情緒的程序化 pad
  }
  // Opt-in cinematic wrapper: opening title (over a darkened/blurred first keyframe) + 「完」end card,
  // joined to the film with dip-to-black. Gated by STUDIO_TITLECARD (default off → zero regression). The
  // served file is always output/final.mp4, so when on we mix to an intermediate then wrap into final.
  const titleOn = (process.env.STUDIO_TITLECARD ?? 'off').toLowerCase() !== 'off' && Boolean(project?.title);
  const final = join(outDir, 'final.mp4');
  const mixOut = titleOn ? join(outDir, 'film_core.mp4') : final;
  await publishProgress({ projectId, stage: 'assemble', status: 'running', message: '合成：混音配樂與響度…' });
  await comp.mixBgm({ video: videoOut, bgm, out: mixOut, bgmGain: project?.bgmGain ?? 0.15 });
  if (titleOn && project) {
    await publishProgress({ projectId, stage: 'assemble', status: 'running', message: '合成：加片頭與片尾…' });
    const { cw, ch } = await projectDims(projectId);
    // generate a longer pad (its swell/env are tuned for long beds) and let cardClip trim to the card —
    // the opening seconds are the natural build-up, which suits a title swell.
    const titlePad = join(outDir, 'title_bgm.wav'); writeFileSync(titlePad, makePad(10, { gain: 0.95, mood }));
    const titleClip = join(outDir, 'title.mp4');
    await comp.cardClip({ out: titleClip, width: cw, height: ch, bgImage: present[0]?.keyframePath ?? undefined, bigText: project.title ?? '', smallText: project.logline ?? undefined, dur: 2.8, audio: titlePad });
    const endPad = join(outDir, 'end_bgm.wav'); writeFileSync(endPad, makePad(10, { gain: 0.8, mood }));
    const endClip = join(outDir, 'end.mp4');
    await comp.cardClip({ out: endClip, width: cw, height: ch, bigText: '完', dur: 2.4, audio: endPad });
    await comp.stitch({ clips: [titleClip, mixOut, endClip], out: final, fades: [0.6, 0.6], transitions: ['fadeblack', 'fadeblack'] });
  }
  return final;
}

// ─────────────────────────── Assemble whole project ───────────────────────────
export async function assembleProject(projectId: string): Promise<string> {
  await publishProgress({ projectId, stage: 'assemble', status: 'running' });
  const all = await prisma.shot.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } });
  const final = await assembleClips(projectId, all, join(projectDir(projectId), 'output'));
  await prisma.studioProject.update({ where: { id: projectId }, data: { status: 'export' } });
  await publishProgress({ projectId, stage: 'done', message: final });
  return final;
}

// ─────────────────────────── Assemble a single scene（一幕單獨成片，可獨立預覽/下載）───────────────────────────
export async function assembleScene(projectId: string, sceneId: string): Promise<string> {
  await publishProgress({ projectId, sceneId, stage: 'assemble', status: 'running' });
  const shots = await prisma.shot.findMany({ where: { projectId, sceneId }, orderBy: { sortOrder: 'asc' } });
  const final = await assembleClips(projectId, shots, sceneOutputDir(projectId, sceneId));
  await publishProgress({ projectId, sceneId, stage: 'scene-done', message: final });
  return final;
}

// ─────────────────────────── Stage loops (worker entrypoints) ───────────────────────────
/** Phase ①：只生成關鍵幀圖片（讓使用者先檢視，再決定生影片）。一次一鏡 + /free。 */
export async function runKeyframesStage(projectId: string, shotIds?: string[]): Promise<void> {
  const shots = await loadTargets(projectId, shotIds);
  await publishProgress({ projectId, stage: 'plan', message: `生成圖片 ${shots.length} 鏡` });
  // 逐鏡容錯：單一鏡失敗（ComfyUI 暫斷/壞 prompt）不該讓整批停擺、後面的鏡全沒生。完成能完成的、記下失敗的，
  // 使用者再用「批次→選未生圖」只補失敗那幾鏡即可（降低重試成本）。全部失敗才 throw（＝ComfyUI 沒開之類）。
  const failed: number[] = [];
  for (const s of shots) {
    try {
      await generateKeyframe(s, projectId);
    } catch (e) {
      failed.push(s.shotNo);
      await publishProgress({ projectId, shotId: s.id, stage: 'keyframe', status: 'error', message: `鏡 ${s.shotNo} 生圖失敗：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      await freeComfy();
    }
  }
  if (shots.length > 0 && failed.length === shots.length) throw new Error(`全部 ${shots.length} 鏡生圖失敗（可能 ComfyUI 未啟動）`);
  const msg = failed.length
    ? `${shots.length - failed.length}/${shots.length} 張關鍵幀完成；鏡 ${failed.join(', ')} 失敗，可用「批次→選未生圖」只重生這幾鏡`
    : `${shots.length} 張關鍵幀已生成`;
  await publishProgress({ projectId, stage: 'keyframes-done', message: msg });
}

/**
 * Phase ②：依關鍵幀生影片（配音→影片）後合成。一次一鏡 + /free，杜絕累積當機。
 * - shotIds 給定 → 只重生那幾鏡（單鏡改完重生），合成整支。
 * - sceneId 給定（且無 shotIds）→ 只生這一幕的分鏡，並「單獨」合成這一幕成片。
 * - 都沒有 → 全專案。
 */
export async function runRenderStage(projectId: string, shotIds?: string[], sceneId?: string): Promise<void> {
  const shots = shotIds?.length
    ? await loadTargets(projectId, shotIds)
    : sceneId
      ? await prisma.shot.findMany({ where: { projectId, sceneId }, orderBy: { sortOrder: 'asc' } })
      : await loadTargets(projectId);
  await publishProgress({ projectId, sceneId, stage: 'plan', message: `生成影片 ${shots.length} 鏡` });
  // 逐鏡容錯：單一鏡失敗不該讓整批停擺、連 assemble 都不跑（那樣連部分成片都拿不到）。完成能完成的，
  // 之後仍組裝（assemble 以 existsSync 過濾已產出的片段）→ 至少拿到部分成片；補生失敗的鏡再重生即完整。
  const failed: number[] = [];
  for (const s of shots) {
    try {
      let cur = s;
      if (!cur.keyframePath) { await generateKeyframe(cur, projectId); await freeComfy(); cur = await reget(s.id); }
      await generateVoice(cur, projectId); cur = await reget(s.id); // 重生配音以反映台詞編輯
      await generateVideo(cur, projectId);
    } catch (e) {
      failed.push(s.shotNo);
      await publishProgress({ projectId, sceneId, shotId: s.id, stage: 'video', status: 'error', message: `鏡 ${s.shotNo} 生片失敗：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      await freeComfy();
    }
  }
  if (shots.length > 0 && failed.length === shots.length) throw new Error(`全部 ${shots.length} 鏡生片失敗（可能 ComfyUI／TTS 未啟動）`);
  if (sceneId) await assembleScene(projectId, sceneId);
  else await assembleProject(projectId);
}

/** 洗圖階段：單鏡 img2img/inpaint 微調 → 新版本（不覆蓋現役）。一次一鏡 + /free，沿用 crash-safe 慣例。 */
export async function runRefineStage(projectId: string, payload: RefinePayload): Promise<void> {
  await publishProgress({ projectId, stage: 'plan', message: '洗圖 1 鏡' });
  await generateRefine(projectId, payload);
  await freeComfy();
}

// ─────────────────────────── Export（成片 → gif / webm 下載格式）───────────────────────────
const exportFile = (pid: string, fmt: string) => join(projectDir(pid), 'output', `export.${fmt}`);

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg export exit ${c}: ${err.slice(-400)}`))));
    p.on('error', reject);
  });
}

/** 把專案成片 final.mp4 轉成可分享格式（gif 適合迷因預覽、webm 較小）。輸出 output/export.<fmt>。 */
export async function runExportStage(projectId: string, format: 'gif' | 'webm'): Promise<void> {
  const src = join(projectDir(projectId), 'output', 'final.mp4');
  if (!existsSync(src)) { await publishProgress({ projectId, stage: 'error', message: '尚無成片可匯出，請先「② 生成影片」' }); return; }
  await publishProgress({ projectId, stage: 'export', status: 'running', message: `匯出 ${format}…` });
  const out = exportFile(projectId, format);
  try {
    if (format === 'gif') {
      await runFfmpeg(['-y', '-i', src, '-vf', 'fps=12,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', out]);
    } else {
      await runFfmpeg(['-y', '-i', src, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-c:a', 'libopus', out]);
    }
  } catch (e) {
    await publishProgress({ projectId, stage: 'error', message: `匯出失敗：${e instanceof Error ? e.message : String(e)}` });
    return;
  }
  await publishProgress({ projectId, stage: 'export-done', status: 'done', message: format });
}
