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

/**
 * 從（可能被截斷的）JSON 陣列文字中救回「完整閉合的頂層物件」，重組成合法陣列字串 `[obj,obj,…]`。
 * LLM 產長陣列時常在 maxTokens 處被切斷，尾端物件殘缺會讓整份 parse 失敗、整批分鏡全丟；
 * 這裡逐字掃描（正確處理字串內的括號與跳脫、物件內的巢狀 []/{}），只保留能完整閉合的物件。純函式。
 * 找不到任何完整物件時回 '[]'。
 */
export function salvageArrayObjects(src: string): string {
  const s = src ?? '';
  const start = s.indexOf('[');
  if (start < 0) return '[]';
  const objs: string[] = [];
  let depth = 0;        // 陣列內的巢狀深度（0＝直接在陣列裡）
  let objStart = -1;    // 目前頂層物件的起點
  let inStr = false, esc = false;
  for (let i = start + 1; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '[') { depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) { objs.push(s.slice(objStart, i + 1)); objStart = -1; }
    }
    else if (ch === ']') {
      if (depth === 0) break; // 頂層陣列正常結束
      depth--;
    }
  }
  return `[${objs.join(',')}]`;
}
