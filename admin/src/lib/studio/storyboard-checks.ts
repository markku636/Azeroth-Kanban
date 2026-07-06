// 分鏡「即時結構健檢」純函式（無 server 相依，client 與 server 皆可 import；不需 LLM/API）。
// 給使用者在「建立分鏡」前就看到確定性、免費、即時的品質提示 —— 補 storyboard-audit（LLM 深度健檢）的不足。

import { SECONDS_PER_SHOT, estimatedSeconds } from './pacing';

/** 檢查用的最小分鏡形狀（PlannedShot / ReviewShot 的子集）。 */
export interface CheckShot {
  visual?: string;
  tts?: string;
  caption?: string;
  punchline?: string;
  branch?: 'still' | 'i2v' | string;
}

export interface StoryboardCheck {
  level: 'info' | 'warn';
  code: string;
  message: string;
  shotIndex?: number; // 0-based；有值＝指向特定鏡
}

// 字幕（大字/反轉下字幕）建議上限：滿版大字，太長會被切掉或擠成小字。
export const CAPTION_MAX = 14;
// 單鏡旁白建議上限（字）：短影音快節奏，過長會拖。
export const TTS_MAX = 42;

const len = (s?: string) => (s ?? '').trim().length;

/**
 * 對一組分鏡做即時結構健檢。opts.targetSeconds 有值時，比對預估片長與目標並提示要增/減幾鏡。
 * 純函式、可測、無副作用。回傳依「先整體、後逐鏡」排序的提示清單。
 */
export function checkStoryboard(shots: CheckShot[], opts?: { targetSeconds?: number }): StoryboardCheck[] {
  const out: StoryboardCheck[] = [];
  const n = shots.length;
  if (n === 0) return out;

  // ① 片長 vs 目標
  const est = estimatedSeconds(n);
  const target = opts?.targetSeconds;
  if (typeof target === 'number' && target > 0) {
    const diffShots = Math.round((target - est) / SECONDS_PER_SHOT);
    if (diffShots >= 2) {
      out.push({ level: 'warn', code: 'too-short', message: `預估約 ${est} 秒，離目標 ${target} 秒還差 ~${diffShots} 鏡（可回上一步調高分鏡數，或再匯入一段接續）。` });
    } else if (diffShots <= -3) {
      out.push({ level: 'info', code: 'too-long', message: `預估約 ${est} 秒，比目標 ${target} 秒長，可刪掉 ~${-diffShots} 個較弱的鏡收緊節奏。` });
    }
  }

  // ② 全靜態單調（沒有任何 i2v 動態鏡）
  if (n >= 4 && shots.every((s) => (s.branch ?? 'still') !== 'i2v')) {
    out.push({ level: 'info', code: 'all-still', message: '全部是靜態鏡；把幾個關鍵鏡改成「動態 i2v」能讓 2 分鐘的片更耐看、不呆板。' });
  }

  // ③ 逐鏡：空鏡、字幕過長、旁白過長
  shots.forEach((s, i) => {
    if (!len(s.tts) && !len(s.caption)) {
      out.push({ level: 'info', code: 'silent', message: `第 ${i + 1} 鏡沒有旁白也沒有大字幕（純畫面）。`, shotIndex: i });
    }
    if (len(s.caption) > CAPTION_MAX) {
      out.push({ level: 'warn', code: 'caption-long', message: `第 ${i + 1} 鏡大字幕 ${len(s.caption)} 字，超過建議的 ${CAPTION_MAX} 字，可能被切掉；精簡更有力。`, shotIndex: i });
    }
    if (len(s.punchline) > CAPTION_MAX) {
      out.push({ level: 'warn', code: 'punchline-long', message: `第 ${i + 1} 鏡反轉下字幕 ${len(s.punchline)} 字，超過建議的 ${CAPTION_MAX} 字。`, shotIndex: i });
    }
    if (len(s.tts) > TTS_MAX) {
      out.push({ level: 'info', code: 'tts-long', message: `第 ${i + 1} 鏡旁白 ${len(s.tts)} 字偏長，短句更跟得上快節奏。`, shotIndex: i });
    }
  });

  return out;
}

/** 把健檢清單濃縮成一行摘要（給精簡顯示）。無問題時回空字串。 */
export function summarizeChecks(checks: StoryboardCheck[]): string {
  if (!checks.length) return '';
  const warns = checks.filter((c) => c.level === 'warn').length;
  const infos = checks.length - warns;
  const parts: string[] = [];
  if (warns) parts.push(`${warns} 個要注意`);
  if (infos) parts.push(`${infos} 個建議`);
  return parts.join('、');
}
