/**
 * 知識庫存取層 —— 從內嵌常數讀取 runbook 與規範文件。
 *
 * 內容來自 knowledge-data.ts(內嵌字串常數),不讀檔案系統,
 * 因此 selkie 套件被打包進 Next.js bundle 後仍能正確運作。
 */
import { ESCALATION_POLICY, RUNBOOKS, SEVERITY_GUIDE } from "./knowledge-data.js";
import type { RunbookHit } from "./schemas.js";

/** 將文字切成小寫英數 token。 */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * 以關鍵字搜尋 runbook。回傳依相關度排序、含完整內容的命中清單。
 * 採簡單的 token 重疊計分(MVP 足夠;真實版可換成向量檢索)。
 */
export async function searchRunbooks(query: string, limit = 4): Promise<RunbookHit[]> {
  const queryTokens = new Set(tokenize(query));

  const hits: RunbookHit[] = RUNBOOKS.map((runbook) => {
    let score = 0;
    for (const token of tokenize(runbook.content)) {
      if (queryTokens.has(token)) score += 1;
    }
    return {
      title: runbook.title,
      path: `knowledge/runbooks/${runbook.slug}.md`,
      score,
      content: runbook.content,
    };
  });

  return hits
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** 讀取嚴重度分級規範。 */
export async function readSeverityGuide(): Promise<string> {
  return SEVERITY_GUIDE;
}

/** 讀取升級政策。 */
export async function readEscalationPolicy(): Promise<string> {
  return ESCALATION_POLICY;
}
