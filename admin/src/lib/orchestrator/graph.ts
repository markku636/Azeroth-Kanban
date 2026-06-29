import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { StateGraph, START, END, Send, interrupt } from '@langchain/langgraph';
import { prisma } from '@/lib/prisma';
import { ComfyUIClient } from '@/lib/comfyui/client';
import { buildSdxl } from '@/lib/engine/keyframe';
import { SealTTSClient } from '@/lib/engine/voiceover';
import { Compositor, probeDuration } from '@/lib/engine/assemble';
import { sfxFile, type SfxName } from '@/lib/engine/sfx';
import { i2v } from '@/lib/engine/i2v';
import { lipsync } from '@/lib/engine/lipsync';
import { makePad } from '@/lib/engine/music';
import { StudioState, type ShotPlan, type ShotArtifacts, type StudioStateT } from './state';
import { getCheckpointer } from './checkpointer';
import { publishProgress } from './events';

// ── engine config from env (local-first; swap via env for cloud) ──
const COMFY_HOST = (process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188').replace(/^https?:\/\//, '');
const COMFY_DIR = process.env.COMFYUI_DIR ?? join(process.cwd(), 'ComfyUI');
const SEAL_URL = process.env.SEAL_TTS_URL ?? 'http://192.168.50.57:7866';
const SEAL_KEY = process.env.SEAL_TTS_API_KEY ?? '';
const STORAGE = process.env.STUDIO_STORAGE_ROOT ?? join(process.cwd(), 'studio-storage');
const CKPT = process.env.STUDIO_SDXL_CKPT ?? 'juggernautXL_v9_V9 + RDPhoto 2.safetensors';

const projectDir = (pid: string) => join(STORAGE, 'projects', pid);
const shotDir = (pid: string, sid: string) => join(projectDir(pid), 'shots', sid);

let _comfy: ComfyUIClient | null = null;
const comfy = () => (_comfy ??= new ComfyUIClient(COMFY_HOST, COMFY_DIR));
const comp = new Compositor();

// Send payloads are typed as the state for addNode compatibility, then narrowed inside.
interface KfPayload { shot: ShotPlan; projectId: string; idx: number }
interface ShotPayload { shot: ShotPlan; projectId: string }
interface VideoPayload { shot: ShotPlan; projectId: string; art: ShotArtifacts }

// only regen the requested shots when regen[] is set, else all
const targets = (s: StudioStateT): ShotPlan[] => (s.regen.length ? s.shots.filter((sh) => s.regen.includes(sh.id)) : s.shots);

async function loadShots(s: StudioStateT) {
  const rows = await prisma.shot.findMany({ where: { projectId: s.projectId }, orderBy: { sortOrder: 'asc' } });
  const shots: ShotPlan[] = rows.map((r) => ({
    id: r.id, shotNo: r.shotNo,
    visual: r.visual ?? '', tts: r.tts ?? '', motion: r.motion ?? '',
    subtitle: r.subtitle ?? r.tts ?? '', speaker: r.speaker ?? 'default',
    emotion: r.emotion, branch: r.branch,
    caption: r.caption, punchline: r.punchline, sfx: r.sfx,
    punch: r.punch, punchAtFrac: r.punchAtFrac, punchZoom: r.punchZoom,
  }));
  await publishProgress({ projectId: s.projectId, stage: 'plan', message: `${shots.length} shots` });
  return { shots };
}

async function gateStory(s: StudioStateT) {
  await publishProgress({ projectId: s.projectId, stage: 'gate', message: '等待分鏡核可' });
  const decision = interrupt({ type: 'approve_storyboard', shots: s.shots }) as { approved?: boolean; regen?: string[] };
  return { approvals: { story: decision?.approved ?? true }, regen: decision?.regen ?? [] };
}

async function genKeyframe(state: StudioStateT) {
  const { shot, projectId, idx } = state as unknown as KfPayload;
  await publishProgress({ projectId, shotId: shot.id, stage: 'keyframe', status: 'running' });
  const prompt = buildSdxl({ ckpt: CKPT, pos: shot.visual, seed: 70000 + idx, prefix: `studio/${projectId}/kf_${shot.id}` });
  const out = await comfy().run(prompt, {
    onProgress: (p) => void publishProgress({ projectId, shotId: shot.id, stage: 'keyframe', pct: p }),
  });
  const raw = out[0]?.path ?? '';
  // 有系統地放好：複製到 studio_storage 的分鏡夾（admin 服務縮圖、後續 lipsync 也讀這份）
  let kfPath = raw;
  try {
    const dir = shotDir(projectId, shot.id);
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, 'keyframe.png');
    if (raw && existsSync(raw)) { copyFileSync(raw, dest); kfPath = dest; }
  } catch { /* keep raw path */ }
  await prisma.shot.update({ where: { id: shot.id }, data: { keyframePath: kfPath, status: 'KEYFRAME' } });
  await publishProgress({ projectId, shotId: shot.id, stage: 'keyframe', status: 'done' });
  return { artifacts: { [shot.id]: { keyframe: kfPath } } };
}

async function genVoice(state: StudioStateT) {
  const { shot, projectId } = state as unknown as ShotPayload;
  await publishProgress({ projectId, shotId: shot.id, stage: 'voice', status: 'running' });
  const tts = new SealTTSClient(SEAL_URL, SEAL_KEY);
  const r = await tts.synth({ speaker: shot.speaker, text: shot.tts, instruct: shot.emotion ?? undefined });
  const dir = shotDir(projectId, shot.id);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'voice.wav');
  writeFileSync(p, r.wav);
  await prisma.shot.update({ where: { id: shot.id }, data: { voiceWav: p, status: 'VOICE' } });
  await publishProgress({ projectId, shotId: shot.id, stage: 'voice', status: 'done' });
  return { artifacts: { [shot.id]: { voice: p } } };
}

async function genVideo(state: StudioStateT) {
  const { shot, projectId, art } = state as unknown as VideoPayload;
  const dir = shotDir(projectId, shot.id);
  mkdirSync(dir, { recursive: true });
  const clip = join(dir, 'clip.mp4');
  let produced = false; // only expose the clip artifact if a branch actually wrote the file
  const isComedy = Boolean(shot.caption || shot.punchline || (shot.sfx && shot.sfx !== 'none') || shot.punch);
  if (shot.branch === 'lip' && art.keyframe && art.voice) {
    // 對嘴：InfiniteTalk(keyframe + voice) → 會說話的數字人影片 → 疊大字幕（喜劇鏡）
    await publishProgress({ projectId, shotId: shot.id, stage: 'video', status: 'running' });
    const talk = await lipsync(comfy(), {
      image: art.keyframe, audio: art.voice, prompt: shot.subtitle || shot.tts || '',
      prefix: `studio/${projectId}/lip_${shot.id}`,
      onProgress: (p) => void publishProgress({ projectId, shotId: shot.id, stage: 'video', pct: p }),
    });
    if (isComedy) {
      const dur = await probeDuration(art.voice);
      const punchAt = shot.punch || shot.punchline ? +(dur * (shot.punchAtFrac ?? 0.55)).toFixed(2) : undefined;
      await comp.memeMotionShot({
        clip: talk[0].path, voice: art.voice, out: clip,
        topCaption: shot.caption ?? undefined, bottomCaption: shot.punchline ?? undefined, punchAt,
      });
    } else {
      await comp.motionShot({ clip: talk[0].path, voice: art.voice, out: clip, subtitle: shot.subtitle });
    }
    await prisma.shot.update({ where: { id: shot.id }, data: { lipsyncMp4: clip, status: 'VIDEO' } });
    produced = true;
  } else if (isComedy && art.keyframe) {
    // 迷因吐槽鏡：大字幕 setup → 反轉下字幕 + punch-zoom（不論 branch）
    await publishProgress({ projectId, shotId: shot.id, stage: 'video', status: 'running' });
    const fbDur = 3.5;
    const dur = art.voice ? await probeDuration(art.voice) : fbDur;
    const frac = shot.punchAtFrac ?? 0.55;
    const punchAt = shot.punch || shot.punchline ? +(dur * frac).toFixed(2) : undefined;
    await comp.memeStill({
      image: art.keyframe, voice: art.voice, out: clip, fallbackDur: fbDur,
      topCaption: shot.caption ?? undefined, bottomCaption: shot.punchline ?? undefined,
      punchAt, punchZoom: shot.punch ? (shot.punchZoom ?? 1.9) : undefined,
    });
    await prisma.shot.update({ where: { id: shot.id }, data: { status: 'VIDEO' } });
    produced = true;
  } else if (shot.branch === 'i2v' && art.keyframe && art.voice) {
    await publishProgress({ projectId, shotId: shot.id, stage: 'video', status: 'running' });
    const motion = await i2v(comfy(), {
      image: art.keyframe, motion: shot.motion || shot.visual, prefix: `studio/${projectId}/i2v_${shot.id}`,
      onProgress: (p) => void publishProgress({ projectId, shotId: shot.id, stage: 'video', pct: p }),
    });
    await comp.motionShot({ clip: motion[0].path, voice: art.voice, out: clip, subtitle: shot.subtitle });
    await prisma.shot.update({ where: { id: shot.id }, data: { i2vMp4: clip, status: 'VIDEO' } });
    produced = true;
  } else if (art.keyframe && art.voice) {
    await comp.still({ image: art.keyframe, voice: art.voice, out: clip });
    await prisma.shot.update({ where: { id: shot.id }, data: { status: 'VIDEO' } });
    produced = true;
  }
  await publishProgress({ projectId, shotId: shot.id, stage: 'video', status: 'done' });
  return { artifacts: { [shot.id]: { clip: produced ? clip : undefined } } };
}

async function assemble(s: StudioStateT) {
  await publishProgress({ projectId: s.projectId, stage: 'assemble', status: 'running' });
  const outDir = join(projectDir(s.projectId), 'output');
  mkdirSync(outDir, { recursive: true });

  // keep shots whose clip artifact actually exists on disk, in order
  const present = s.shots.filter((sh) => {
    const c = s.artifacts[sh.id]?.clip;
    return Boolean(c) && existsSync(c as string);
  });
  const clips = present.map((sh) => s.artifacts[sh.id]!.clip as string);
  if (clips.length === 0) throw new Error('assemble: no shot clips were produced');
  // hard-cut (0) into a punchline/punch shot for comedic snap; else 0.25 crossfade (= prior default)
  const fades = present.slice(1).map((sh) => (sh.punch || sh.punchline ? 0 : 0.25));

  const body = join(outDir, 'body.mp4');
  await comp.stitch({ clips, out: body, fades });

  // overlay timed SFX at each shot's punch point (absolute body time, accounting for crossfade overlaps)
  let videoOut = body;
  if (present.some((sh) => sh.sfx && sh.sfx !== 'none')) {
    const durs = await Promise.all(clips.map((c) => probeDuration(c)));
    const starts = [0];
    for (let i = 1; i < clips.length; i++) {
      const f = fades[i - 1] <= 0 ? 0 : fades[i - 1];
      starts.push(starts[i - 1] + durs[i - 1] - f);
    }
    const cues = present
      .map((sh, i) => ({ sh, i }))
      .filter((x) => x.sh.sfx && x.sh.sfx !== 'none')
      .map((x) => ({
        sfx: sfxFile(x.sh.sfx as SfxName, join(outDir, 'sfx')),
        atSec: +(starts[x.i] + durs[x.i] * (x.sh.punchAtFrac ?? 0.55)).toFixed(2),
        gain: 0.8,
      }));
    const withSfx = join(outDir, 'body_sfx.mp4');
    await comp.mixSfx({ video: body, cues, out: withSfx });
    videoOut = withSfx;
  }

  const dur = await probeDuration(videoOut);
  const bgm = join(outDir, 'bgm.wav');
  writeFileSync(bgm, makePad(dur + 0.5, { gain: 0.8 }));
  const final = join(outDir, 'final.mp4');
  await comp.mixBgm({ video: videoOut, bgm, out: final, bgmGain: 0.15 });
  await prisma.studioProject.update({ where: { id: s.projectId }, data: { status: 'export' } });
  await publishProgress({ projectId: s.projectId, stage: 'done', message: final });
  return { finalPath: final };
}

export function buildGraph() {
  const g = new StateGraph(StudioState)
    .addNode('loadShots', loadShots)
    .addNode('gateStory', gateStory)
    .addNode('genKeyframe', genKeyframe)
    .addNode('afterKeyframes', async () => ({}))
    .addNode('genVoice', genVoice)
    .addNode('afterVoices', async () => ({}))
    .addNode('genVideo', genVideo)
    .addNode('afterVideos', async () => ({}))
    .addNode('assemble', assemble)
    .addEdge(START, 'loadShots')
    .addEdge('loadShots', 'gateStory')
    .addConditionalEdges('gateStory', (s: StudioStateT) => targets(s).map((sh) => new Send('genKeyframe', { shot: sh, projectId: s.projectId, idx: sh.shotNo })), ['genKeyframe'])
    .addEdge('genKeyframe', 'afterKeyframes')
    .addConditionalEdges('afterKeyframes', (s: StudioStateT) => targets(s).map((sh) => new Send('genVoice', { shot: sh, projectId: s.projectId })), ['genVoice'])
    .addEdge('genVoice', 'afterVoices')
    .addConditionalEdges('afterVoices', (s: StudioStateT) => targets(s).map((sh) => new Send('genVideo', { shot: sh, projectId: s.projectId, art: s.artifacts[sh.id] ?? {} })), ['genVideo'])
    .addEdge('genVideo', 'afterVideos')
    .addEdge('afterVideos', 'assemble')
    .addEdge('assemble', END);
  return g.compile({ checkpointer: getCheckpointer() });
}
