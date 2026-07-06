// 短影音節奏／分批改編的純函式（無 server 相依，client 與 server 皆可 import）。
// 用途：把「目標片長」換算成分鏡數；把一長段參考逐字稿切成數段、分批改編成分鏡，
// 突破單次 LLM 呼叫的 token/品質瓶頸（要做到 ~2 分鐘片需要 ~30 鏡，單次產出會截斷）。

/** 短影音實測平均每鏡秒數（含旁白＋快切）；memory 實測「每鏡 tts 約 3.5–4s」取中值。相容用途保留（如 storyboard-checks 的鏡差估算）。 */
export const SECONDS_PER_SHOT = 3.8;

// 依「目標片長」動態的每鏡秒數：短影音快切、長片讓每鏡多喘口氣（不會切太碎、更耐看）。級距由短到長，
// 每個 [上限秒, 每鏡秒] 表示「≤上限」用該速。刻意讓 2 分鐘仍 ~29 鏡（與既有內容/健檢一致），只有更長片才放慢。
const PACE_BRACKETS: readonly [number, number][] = [[45, 3.5], [90, 3.8], [180, 4.2], [Infinity, 5.0]];

/** 目標片長（秒）→ 該長度合適的每鏡秒數（短快、長慢）。 */
export function secondsPerShot(targetSeconds: number): number {
  const s = Math.max(0, targetSeconds);
  return (PACE_BRACKETS.find(([hi]) => s <= hi) ?? PACE_BRACKETS[PACE_BRACKETS.length - 1])[1];
}

/** 目標片長（秒）→ 建議分鏡數（長度感知：長片鏡數不會爆多）。 */
export function shotsForDuration(seconds: number): number {
  return Math.max(1, Math.round(seconds / secondsPerShot(seconds)));
}

/** 分鏡數 → 估計片長（秒）。shotsForDuration 的一致反函式：**用鏡數界定級距**（對應 45/90/180s 的鏡數上限
 *  13/24/43），避免用秒界定時在邊界因四捨五入來回跳級。 */
export function estimatedSeconds(shotCount: number): number {
  const c = Math.max(0, shotCount);
  if (c <= 13) return Math.round(c * 3.5); // ≲45s
  if (c <= 24) return Math.round(c * 3.8); // ≲90s
  if (c <= 43) return Math.round(c * 4.2); // ≲180s
  return Math.round(c * 5.0);              // 長片
}

/** 片長分類（short/long 分界＝完播率甜蜜點上緣）。供 UI 標示與長短片各自的建議。 */
export type DurationClass = 'short' | 'medium' | 'long';
export function durationClass(seconds: number): DurationClass {
  if (seconds <= 60) return 'short';   // 短影音黃金區（越短越易完播）
  if (seconds <= 120) return 'medium'; // 中片
  return 'long';                       // 長片（需靠章節/進度條/re-hook 撐注意力）
}

/** 針對片長給一句「怎麼做比較好」的提示（純文字，UI 可直接顯示）。 */
export function pacingHint(seconds: number): string {
  switch (durationClass(seconds)) {
    case 'short': return '短影音黃金區：開場 3 秒定生死，一個明確重點、快切到底，別鋪陳。';
    case 'medium': return '中片：確保每 5–8 秒有新看點；用逐句字幕＋轉場音效維持節奏。';
    default: return '長片：開啟章節標題與進度條，中段每段落都要有 re-hook（新問題／反轉）避免流失。';
  }
}

// 依「旁白字數」估片長：TTS 朗讀時間才是真正決定單鏡長短的因素（比固定 3.8s/鏡準很多）。
export const CHARS_PER_SECOND = 4.5; // 中文 TTS 平均語速（cosyvoice3 實測約 3.5–5 字/秒，取中）
export const STILL_MIN_SECONDS = 2.2; // 靜態 Ken-Burns 鏡的最短觀看時間
export const I2V_SECONDS = 4.0; // i2v clip 固定時長（引擎 fallbackDur）
export const SHOT_PAD_SECONDS = 0.5; // 每鏡留白/轉場緩衝

/** 依旁白字數（＋branch）估單鏡秒數。空旁白時退回該 branch 的最短時間。純函式、可測。 */
export function estimateShotSeconds(shot: { tts?: string; branch?: string }): number {
  const chars = (shot.tts ?? '').trim().length;
  const speak = chars / CHARS_PER_SECOND + (chars ? SHOT_PAD_SECONDS : 0);
  return (shot.branch ?? 'still') === 'i2v' ? Math.max(I2V_SECONDS, speak) : Math.max(STILL_MIN_SECONDS, speak);
}

/** 依每鏡旁白字數加總估全片秒數（比 estimatedSeconds(count) 準）。 */
export function estimateStoryboardSeconds(shots: { tts?: string; branch?: string }[]): number {
  return Math.round(shots.reduce((sum, s) => sum + estimateShotSeconds(s), 0));
}

/** 目標片長預設選項（供 UI 快選）。value=秒。短影音（15–60）＋長片（90–300）兼顧。 */
export const DURATION_PRESETS: { label: string; seconds: number }[] = [
  { label: '15 秒', seconds: 15 },
  { label: '30 秒', seconds: 30 },
  { label: '45 秒', seconds: 45 },
  { label: '60 秒', seconds: 60 },
  { label: '90 秒', seconds: 90 },
  { label: '2 分鐘', seconds: 120 },
  { label: '3 分鐘', seconds: 180 },
  { label: '5 分鐘', seconds: 300 },
];

// 分批改編參數：每批 LLM 呼叫最多產這麼多鏡（品質＋token 預算的甜蜜點）；
// 目標鏡數 ≤ 此值時走單次呼叫（與舊行為相容）。
export const ADAPT_BATCH_MAX = 8;
export const ADAPT_SINGLE_MAX = 12;

export interface AdaptBatch {
  shots: number; // 此批要產生的分鏡數
  startFrac: number; // 對應來源逐字稿的起點比例 (0–1)
  endFrac: number; // 對應來源逐字稿的終點比例 (0–1)
  index: number; // 0-based 批次序
  total: number; // 總批數
}

/**
 * 把目標鏡數切成數批，並把來源逐字稿依比例分配給每批（開頭段→鉤子、結尾段→爆點）。
 * 鏡數盡量平均分配；批數 = ceil(count / batchMax)。純函式、可測。
 */
export function planAdaptationBatches(count: number, batchMax = ADAPT_BATCH_MAX): AdaptBatch[] {
  const n = Math.max(1, Math.floor(count || 0));
  const size = Math.max(1, Math.floor(batchMax || ADAPT_BATCH_MAX));
  const batches = Math.max(1, Math.ceil(n / size));
  const base = Math.floor(n / batches);
  const rem = n - base * batches; // 前 rem 批各多 1 鏡
  const out: AdaptBatch[] = [];
  for (let i = 0; i < batches; i++) {
    out.push({
      shots: base + (i < rem ? 1 : 0),
      startFrac: i / batches,
      endFrac: (i + 1) / batches,
      index: i,
      total: batches,
    });
  }
  return out;
}

const BOUNDARY = new Set(['\n', '。', '！', '？', '!', '?', '.', '…', '，', '、', ';', '；']);

/**
 * 比例 → 切點索引，並把切點對齊到「下一個句子/標點邊界之後」。
 * 關鍵：對同一個 frac 永遠回同一索引（且對 frac 單調不減）→ 相鄰批次的 endFrac==下一批 startFrac
 * 會算出**完全相同**的切點，故無縫、不重疊、不漏字。
 */
function cutAt(s: string, frac: number): number {
  const len = s.length;
  if (frac <= 0) return 0;
  if (frac >= 1) return len;
  const pos = Math.min(len, Math.max(0, Math.round(len * frac)));
  const WIN = 120; // 邊界搜尋窗口
  for (let i = pos; i < Math.min(len, pos + WIN); i++) {
    if (BOUNDARY.has(s[i])) return i + 1; // 切在邊界字之後
  }
  return pos; // 窗口內找不到邊界 → 用原位（極少見）
}

/**
 * 依比例切出逐字稿的一段，切點對齊句子/標點邊界（避免切在句中）。純函式、可測。
 */
export function sliceByFraction(text: string, startFrac: number, endFrac: number): string {
  const s = text ?? '';
  if (s.length === 0) return '';
  const start = cutAt(s, startFrac);
  const end = cutAt(s, endFrac);
  if (start >= end) return s.slice(start).trim(); // 極端情形保底：回傳到尾端
  return s.slice(start, end).trim();
}
