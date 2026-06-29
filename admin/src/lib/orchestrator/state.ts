import { Annotation } from '@langchain/langgraph';

export interface ShotPlan {
  id: string;
  shotNo: number;
  visual: string;
  tts: string;
  motion: string;
  subtitle: string;
  speaker: string;
  emotion: string | null;
  branch: string; // lip | i2v | still
  // 喜劇可選欄位（迷因吐槽）
  caption?: string | null;
  punchline?: string | null;
  sfx?: string | null;
  punch?: boolean;
  punchAtFrac?: number | null;
  punchZoom?: number | null;
}

export interface ShotArtifacts {
  keyframe?: string;
  voice?: string;
  clip?: string;
}

// per-shot deep merge — keyframe/voice/clip for the same shot id accumulate without clobbering.
// This is the primitive that makes single-shot regeneration safe.
const mergeArtifacts = (
  a: Record<string, ShotArtifacts>,
  b: Record<string, ShotArtifacts>,
): Record<string, ShotArtifacts> => {
  const out: Record<string, ShotArtifacts> = { ...a };
  for (const k of Object.keys(b)) out[k] = { ...(out[k] ?? {}), ...b[k] };
  return out;
};

export const StudioState = Annotation.Root({
  projectId: Annotation<string>(),
  shots: Annotation<ShotPlan[]>({ reducer: (_a, b) => b, default: () => [] }),
  approvals: Annotation<Record<string, boolean>>({ reducer: (a, b) => ({ ...a, ...b }), default: () => ({}) }),
  artifacts: Annotation<Record<string, ShotArtifacts>>({ reducer: mergeArtifacts, default: () => ({}) }),
  // when non-empty, only these shot ids are (re)generated — single-shot retake
  regen: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  finalPath: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
});

export type StudioStateT = typeof StudioState.State;
