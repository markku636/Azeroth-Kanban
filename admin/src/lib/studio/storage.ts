// Single source of truth for studio_storage paths + artifact existence checks.
// Server-only (uses node:fs). Mirrors the layout written by lib/orchestrator/stages.ts:
//   projects/<pid>/output/final.mp4        ← 整支成片（每次 render 覆寫）
//   projects/<pid>/shots/<sid>/clip.mp4    ← 單鏡影片（lip/i2v/still/喜劇 各分支都寫這）
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const STUDIO_STORAGE_ROOT = process.env.STUDIO_STORAGE_ROOT ?? join(process.cwd(), 'studio-storage');

export const projectDir = (projectId: string): string => join(STUDIO_STORAGE_ROOT, 'projects', projectId);
export const projectOutputFile = (projectId: string): string => join(projectDir(projectId), 'output', 'final.mp4');
/** 字幕檔（SRT/VTT）路徑，與 final.mp4 同目錄（assembleClips 每次成片時一併寫出）。 */
export const projectSubtitleFile = (projectId: string, ext: 'srt' | 'vtt' = 'srt'): string => join(projectDir(projectId), 'output', `final.${ext}`);
/** YouTube 章節檔路徑（final.chapters.txt）。 */
export const projectChaptersFile = (projectId: string): string => join(projectDir(projectId), 'output', 'final.chapters.txt');
export const shotClipFile = (projectId: string, shotId: string): string => join(projectDir(projectId), 'shots', shotId, 'clip.mp4');
export const sceneOutputFile = (projectId: string, sceneId: string): string => join(projectDir(projectId), 'scenes', sceneId, 'final.mp4');

export interface OutputInfo {
  hasOutput: boolean;
  /** ISO mtime of final.mp4，供前端顯示「成片於 …」與快取破壞 */
  outputUpdatedAt: string | null;
}

/** 此專案是否已有成片 final.mp4，以及其最後產生時間。任何 IO 例外都安全回退為「無」。 */
export function projectOutputInfo(projectId: string): OutputInfo {
  return fileOutputInfo(projectOutputFile(projectId));
}

/** 此專案是否已有匯出的 SRT 字幕檔（舊成片可能沒有，重生一次即會補上）。 */
export function projectHasSubtitles(projectId: string): boolean {
  try { return existsSync(projectSubtitleFile(projectId, 'srt')); } catch { return false; }
}

/** 此專案是否已有 YouTube 章節檔（需 ≥2 個有標題的場景才會產生）。 */
export function projectHasChapters(projectId: string): boolean {
  try { return existsSync(projectChaptersFile(projectId)); } catch { return false; }
}

/** 此「幕」是否已有單獨成片 scenes/<sceneId>/final.mp4，以及最後產生時間。 */
export function sceneOutputInfo(projectId: string, sceneId: string): OutputInfo {
  return fileOutputInfo(sceneOutputFile(projectId, sceneId));
}

function fileOutputInfo(f: string): OutputInfo {
  try {
    if (!existsSync(f)) return { hasOutput: false, outputUpdatedAt: null };
    return { hasOutput: true, outputUpdatedAt: statSync(f).mtime.toISOString() };
  } catch {
    return { hasOutput: false, outputUpdatedAt: null };
  }
}

/**
 * 此分鏡是否已有可播放的單鏡影片。
 * 先看 DB 記錄的絕對路徑（lip/i2v 分支），再退回 studio_storage 慣例路徑（still / 喜劇 memeStill）。
 */
export function shotHasClip(projectId: string, shotId: string, dbPaths: (string | null | undefined)[] = []): boolean {
  try {
    for (const p of dbPaths) if (p && existsSync(p)) return true;
    return existsSync(shotClipFile(projectId, shotId));
  } catch {
    return false;
  }
}
