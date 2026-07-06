// transitions.ts — 場景接縫的 xfade 轉場選擇（純資料 + 純函式、零副作用）。只決定「轉場名」，**不碰 fade 秒數**
// （秒數與 SFX 卡點時間耦合，仍由 assembleClips 決定）→ 換轉場名不影響音效對齊。決定性輪替（無 RNG）讓整片
// 轉場有變化又可重現。只用耐看的轉場（不用 pixelize/distance 這種花俏的）。

export type SeamKind = 'punch' | 'scene' | 'within';

// 換場景（清楚的故事節拍）：戲劇性但不俗氣的一組；輪替避免整片同一種。
const SCENE_TRANSITIONS = ['fadeblack', 'dissolve', 'circleopen', 'radial', 'smoothup', 'fadewhite'] as const;
// 同場景內（柔順不搶戲）。
const WITHIN_TRANSITIONS = ['fade', 'dissolve', 'smoothleft', 'smoothright'] as const;

// 沉穩情緒（恐怖/懸疑/低落）只用最不花俏的轉場，避免破壞氛圍。
const SOLEMN_MOODS = new Set(['horror', 'somber', 'tense']);

/**
 * 選一個 xfade 轉場名。
 * - punch（喜劇爆點）→ 'fade'（硬切：呼叫端會給 duration 0，xfade 名不影響硬切觀感）。
 * - scene / within → 依 seed 決定性輪替該類集合（同一 seed 永遠同結果 → 可重現）。
 * - mood 為沉穩情緒時：換場景一律 fadeblack、同場景一律 dissolve（最沉穩），不做花俏輪替。
 * 純函式、可測。
 */
export function pickTransition(kind: SeamKind, seed: number, mood?: string): string {
  if (kind === 'punch') return 'fade';
  const solemn = mood != null && SOLEMN_MOODS.has(mood);
  const idx = Math.abs(Math.trunc(seed || 0));
  if (kind === 'scene') return solemn ? 'fadeblack' : SCENE_TRANSITIONS[idx % SCENE_TRANSITIONS.length];
  return solemn ? 'dissolve' : WITHIN_TRANSITIONS[idx % WITHIN_TRANSITIONS.length];
}
