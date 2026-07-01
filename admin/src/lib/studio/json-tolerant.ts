// LLM（尤其 Gemini）常在陣列/物件末端多一個逗號（`…},]` / `…",}`）→ 嚴格 JSON.parse 會直接爆，
// 讓分鏡/腳本/聖經/YouTube 文案/Agent 提案等 AI 功能「靜默失敗」回空。這裡提供容忍式解析：
// 先嚴格 parse（合法 JSON 零風險、不動字串內逗號），失敗才移除結構性尾逗號後重試。

/** 移除 ] } 前的結構性尾逗號（只在括號/大括號前，字串內的逗號不受影響）。純函式。 */
export function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[\]}])/g, '$1');
}

/** 容忍式 JSON parse：合法 JSON 照常解析；遇到 LLM 常見尾逗號則清理後重試。仍失敗會 throw（交呼叫端 catch）。 */
export function tolerantJsonParse(src: string): unknown {
  try { return JSON.parse(src); } catch { /* 尾逗號等 → 清理後重試 */ }
  return JSON.parse(stripTrailingCommas(src));
}
