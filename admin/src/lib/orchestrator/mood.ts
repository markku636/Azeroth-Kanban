// 依專案挑程序化配樂(makePad)的情緒。純函式、無外部相依（供 stages.ts 用、可獨立單元測試）。
import { MOOD_KEYS } from '@/lib/engine/music';

/**
 * BGM 情緒最終決定：per-project 覆寫（spec.bgmMood）＞ 風格預設（preset.bgmMood）＞ 自動推導（tone/genre/分鏡情緒）。
 * 只有「合法 MOOD key」才採用（否則往下一層退），避免存進非法值時整段配樂退成 neutral 而無感。純函式、可測。
 */
export function resolveBgmMood(override: string | null | undefined, presetMood: string | null | undefined, autoMood: string): string {
  const ok = (m: string | null | undefined): m is string => typeof m === 'string' && MOOD_KEYS.includes(m);
  if (ok(override)) return override;
  if (ok(presetMood)) return presetMood;
  return autoMood;
}

// tone/genre → mood（與原版完全一致：明確 tone/genre 的專案配樂情緒不變＝零回歸）。
export function moodFromToneGenre(txt: string): string {
  const t = txt.toLowerCase();
  if (/(tense|suspense|thriller|horror|action|驚悚|懸疑|緊張|恐怖|動作)/.test(t)) return 'tense';
  if (/(sad|melanchol|grief|somber|emotional|悲|哀|憂|傷感|療傷|催淚)/.test(t)) return 'somber';
  if (/(warm|happy|uplift|comedy|feel-?good|喜劇|溫暖|歡|勵志|搞笑|療癒)/.test(t)) return 'warm';
  return 'neutral';
}

// 分鏡情緒 → mood（較寬、涵蓋常見中文情緒詞）：只在 tone/genre 說不清時，用分鏡情緒多數決補一個更貼切的。
export function moodFromEmotion(txt: string): string {
  const t = txt.toLowerCase();
  if (/(tense|緊張|驚|恐|懸疑|不安)/.test(t)) return 'tense';
  if (/(sad|悲|哀|憂|傷感|催淚|谷底|失落|落寞|不捨|孤獨|認命|落差|失望|尷尬)/.test(t)) return 'somber';
  if (/(warm|happy|喜|溫暖|溫馨|歡|勵志|熱血|得意|會心|感動|釋懷|興奮|療癒|好笑|爆笑|期待)/.test(t)) return 'warm';
  return 'neutral';
}

/**
 * 明確 tone/genre → 與原版一致（零回歸）；tone/genre 未明確時（很多專案沒細填），改用「分鏡情緒的多數決」
 * 補一個更貼切的（原本一律 neutral 平淡）。
 */
export function moodFromProject(
  p: { tone?: string | null; genre?: string | null } | null,
  shots?: { emotion?: string | null }[],
): string {
  const primary = moodFromToneGenre(`${p?.tone ?? ''} ${p?.genre ?? ''}`);
  if (primary !== 'neutral') return primary; // 零回歸
  const counts: Record<string, number> = { tense: 0, somber: 0, warm: 0 };
  for (const s of shots ?? []) { const m = moodFromEmotion(s.emotion ?? ''); if (m !== 'neutral') counts[m] += 1; }
  const best = (Object.entries(counts) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : 'neutral';
}
