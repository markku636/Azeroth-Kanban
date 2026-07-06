// 短影音節奏／分批改編的純函式（無 server 相依，client 與 server 皆可 import）。
// 用途：把「目標片長」換算成分鏡數；把一長段參考逐字稿切成數段、分批改編成分鏡，
// 突破單次 LLM 呼叫的 token/品質瓶頸（要做到 ~2 分鐘片需要 ~30 鏡，單次產出會截斷）。

/** 短影音實測平均每鏡秒數（含旁白＋快切）；memory 實測「每鏡 tts 約 3.5–4s」取中值。 */
export const SECONDS_PER_SHOT = 3.8;

/** 目標片長（秒）→ 建議分鏡數。 */
export function shotsForDuration(seconds: number): number {
  return Math.max(1, Math.round(seconds / SECONDS_PER_SHOT));
}

/** 分鏡數 → 估計片長（秒）。 */
export function estimatedSeconds(shotCount: number): number {
  return Math.max(0, Math.round(shotCount * SECONDS_PER_SHOT));
}

/** 目標片長預設選項（供 UI 快選）。value=秒。 */
export const DURATION_PRESETS: { label: string; seconds: number }[] = [
  { label: '15 秒', seconds: 15 },
  { label: '30 秒', seconds: 30 },
  { label: '60 秒', seconds: 60 },
  { label: '90 秒', seconds: 90 },
  { label: '2 分鐘', seconds: 120 },
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
