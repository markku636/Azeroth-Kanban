// 分鏡「即時結構健檢」純函式（無 server 相依，client 與 server 皆可 import；不需 LLM/API）。
// 給使用者在「建立分鏡」前就看到確定性、免費、即時的品質提示 —— 補 storyboard-audit（LLM 深度健檢）的不足。

import { estimateStoryboardSeconds } from './pacing';

/** 檢查用的最小分鏡形狀（PlannedShot / ReviewShot 的子集）。 */
export interface CheckShot {
  visual?: string;
  tts?: string;
  caption?: string;
  punchline?: string;
  punch?: boolean;
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
// 研究：短影音完播率在 ~45–60s 後明顯下滑；目標超過此值時提醒中段要持續加碼。
export const LONG_TARGET_SECONDS = 75;
// 研究：鉤子要在前 2–3 秒講完（50–60% 觀眾在前 3 秒滑走）；第 1 鏡旁白過長＝開場太慢。
export const HOOK_TTS_MAX = 22;

const len = (s?: string) => (s ?? '').trim().length;
// 比對相鄰旁白是否重複：去掉空白與標點再比（只抓「內容真的一樣」，不做模糊相似）。
const normTts = (s?: string) => (s ?? '').replace(/[\s，。、！？!?.…~～「」『』（）()]/g, '').trim();

/**
 * 對一組分鏡做即時結構健檢。opts.targetSeconds 有值時，比對預估片長與目標並提示要增/減幾鏡。
 * 純函式、可測、無副作用。回傳依「先整體、後逐鏡」排序的提示清單。
 */
export function checkStoryboard(shots: CheckShot[], opts?: { targetSeconds?: number; expectComedy?: boolean }): StoryboardCheck[] {
  const out: StoryboardCheck[] = [];
  const n = shots.length;
  if (n === 0) return out;

  // 選了「好笑」風格卻整片沒有任何喜劇元素（大字幕/反轉字幕/爆點鏡）→ 可能改編得太平，提醒調整。
  if (opts?.expectComedy && n >= 2 && !shots.some((s) => len(s.caption) || len(s.punchline) || s.punch)) {
    out.push({ level: 'warn', code: 'no-comedy', message: '選了「好笑」風格，但整片沒有大字幕/反轉/爆點——可能改編得太平。用逐鏡「換一個」加梗，或回上一步重新改編。' });
  }

  // ① 片長 vs 目標（依旁白字數估算，比固定 3.8s/鏡準）
  const est = estimateStoryboardSeconds(shots);
  const target = opts?.targetSeconds;
  if (typeof target === 'number' && target > 0) {
    // 用「這支片實際的每鏡秒數」(est/n) 換算差幾鏡，比固定常數準，也不受 pacing 長度感知常數變動影響。
    const avgPace = Math.max(2, est / n);
    const diffShots = Math.round((target - est) / avgPace);
    if (diffShots >= 2) {
      out.push({ level: 'warn', code: 'too-short', message: `預估約 ${est} 秒，離目標 ${target} 秒還差 ~${diffShots} 鏡（可回上一步調高分鏡數，或再匯入一段接續）。` });
    } else if (diffShots <= -3) {
      out.push({ level: 'info', code: 'too-long', message: `預估約 ${est} 秒，比目標 ${target} 秒長，可刪掉 ~${-diffShots} 個較弱的鏡收緊節奏。` });
    }
    // 研究背書：短影音完播率在 ~45–60 秒後明顯下滑，長片要靠中段持續加碼維持注意力。
    if (target >= LONG_TARGET_SECONDS) {
      out.push({ level: 'info', code: 'long-target', message: `目標 ${target} 秒偏長——短影音多在 45–60 秒內完播率最佳。要撐住這個長度，中段每 5–8 秒就要給一個新看點或爆點，避免中途流失。` });
    }
  }

  // ② 開場鉤子要快（研究：前 2–3 秒決定去留；第 1 鏡旁白過長＝鉤子太慢）
  if (n >= 2 && len(shots[0].tts) > HOOK_TTS_MAX) {
    out.push({ level: 'warn', code: 'slow-hook', message: `開場要快——第 1 鏡旁白 ${len(shots[0].tts)} 字偏長，鉤子最好 2–3 秒內講完，把最有看點/最衝突的一句放到最前面。`, shotIndex: 0 });
  }

  // ②b 結尾要有爆點（研究：強結尾＝重看/留言）。最後一鏡若無旁白也無任何字幕＝收在空拍，弱。
  const last = n - 1;
  if (n >= 2 && !len(shots[last].tts) && !len(shots[last].caption) && !len(shots[last].punchline)) {
    out.push({ level: 'info', code: 'weak-ending', message: `結尾鏡沒有旁白也沒有大字幕；短影音收在一句記得住的話（回扣開頭或爆點）更有力，也更容易引導留言。`, shotIndex: last });
  }

  // ③ 全靜態單調（沒有任何 i2v 動態鏡）
  if (n >= 4 && shots.every((s) => (s.branch ?? 'still') !== 'i2v')) {
    out.push({ level: 'info', code: 'all-still', message: '全部是靜態鏡；把幾個關鍵鏡改成「動態 i2v」能讓 2 分鐘的片更耐看、不呆板。' });
  }

  // ④ 逐鏡：空鏡、字幕過長、旁白過長
  shots.forEach((s, i) => {
    if (i < n - 1 && !len(s.tts) && !len(s.caption) && !len(s.punchline)) { // 最後一鏡由 weak-ending 專管；有反轉字幕就不算純畫面
      out.push({ level: 'info', code: 'silent', message: `第 ${i + 1} 鏡沒有旁白也沒有大字幕（純畫面）。`, shotIndex: i });
    }
    if (len(s.caption) > CAPTION_MAX) {
      out.push({ level: 'warn', code: 'caption-long', message: `第 ${i + 1} 鏡大字幕 ${len(s.caption)} 字，超過建議的 ${CAPTION_MAX} 字，可能被切掉；精簡更有力。`, shotIndex: i });
    }
    if (len(s.punchline) > CAPTION_MAX) {
      out.push({ level: 'warn', code: 'punchline-long', message: `第 ${i + 1} 鏡反轉下字幕 ${len(s.punchline)} 字，超過建議的 ${CAPTION_MAX} 字。`, shotIndex: i });
    }
    if (i > 0 && len(s.tts) > TTS_MAX) { // 第 1 鏡由 slow-hook 專門把關，避免重複提醒
      out.push({ level: 'info', code: 'tts-long', message: `第 ${i + 1} 鏡旁白 ${len(s.tts)} 字偏長，短句更跟得上快節奏。`, shotIndex: i });
    }
    // visual 應為英文 SDXL 提示；含較多中文＝LLM 寫了中文、或要求畫面出現中文字 → SDXL 渲成亂碼、傷畫質
    if (((s.visual ?? '').match(/[一-鿿]/g)?.length ?? 0) >= 4) {
      out.push({ level: 'info', code: 'cjk-visual', message: `第 ${i + 1} 鏡的畫面描述含中文，SDXL 無法正確渲染文字（會變亂碼）；用「換一個」重寫成英文、或把文字交給字幕欄位。`, shotIndex: i });
    }
  });

  // ⑤ 旁白重複：相鄰＝拖節奏；不相鄰＝同一句用了兩次（長片堆笑點時容易撞梗）。保守：正規化後完全相同、長度≥4。
  const seenTts = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = normTts(shots[i].tts);
    if (key.length < 4) continue;
    const prev = seenTts.get(key);
    if (prev === undefined) { seenTts.set(key, i); continue; } // 只記第一次出現，之後的都對照它
    if (prev === i - 1) {
      out.push({ level: 'warn', code: 'dup-narration', message: `第 ${i} 與第 ${i + 1} 鏡旁白幾乎一樣，改寫其一避免重複、讓劇情往前推。`, shotIndex: i });
    } else {
      out.push({ level: 'warn', code: 'repeat-narration', message: `第 ${i + 1} 鏡旁白和第 ${prev + 1} 鏡重複（同一句用了兩次）；改寫其一讓每個笑點都是新的。`, shotIndex: i });
    }
  }

  // 警告優先（modal 只顯示前幾條，重要的先出）。Array.sort 穩定 → 同級維持原順序。
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1));
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
