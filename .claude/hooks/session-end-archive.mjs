/**
 * SessionEnd 自動歸檔 Hook（Node.js ESM 跨平台版）v3
 *
 * Session 結束時，掃描 doing/ 資料夾，將標記為 ✅ 的文件
 * 自動移至對應的 completed/ 資料夾。
 * 歸檔完成後，寫入 docs/.last-session-archive.json，
 * 供 session-end-knowledge.mjs 讀取（取代不可靠的日期篩選）。
 * 注意：此檔每次 SessionEnd 整檔覆寫，僅保留「本次 Session」歸檔清單，
 * 並非累積歷史；歷史歸檔紀錄請看 completed/ 資料夾的 git log。
 *
 * 歸檔對象（按依賴順序，PRD 先於 Plan）：
 *   - docs/requirements/doing/ → docs/requirements/completed/   (✅ = 已確認)
 *   - docs/plans/doing/        → docs/plans/completed/          (✅ = 已完成)
 *   - docs/specs/doing/        → docs/specs/completed/          (✅ = 已完成)
 *   - docs/bugs/doing/         → docs/bugs/completed/           (✅ = 已修復)
 *
 * 使用方式：由 Claude Code SessionEnd Hook 自動呼叫（第一個執行）
 */

import { readFileSync, readdirSync, renameSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ARCHIVE_DIRS = [
  { doing: "docs/requirements/doing", completed: "docs/requirements/completed", type: "requirement" },
  { doing: "docs/plans/doing",        completed: "docs/plans/completed",        type: "plan" },
  { doing: "docs/specs/doing",        completed: "docs/specs/completed",        type: "spec" },
  { doing: "docs/bugs/doing",         completed: "docs/bugs/completed",         type: "bug" },
];

// 只讀取「狀態列」判斷是否完成，避免被內文敘述性 ✅ 誤觸發。
// 匹配 `> 狀態: ...` 或 `> **狀態**: ...`，取第一筆（通常在檔案開頭）。
function isArchivable(content) {
  const match = content.match(/^\s*>\s*(?:\*\*)?\s*狀態\s*(?:\*\*)?\s*:\s*(.+)$/m);
  if (!match) return false;
  const status = match[1].replace(/\*/g, "").trim();
  // 模板佔位符同時含 🔵 / 🟡 / ❓，視為未填寫或進行中，不歸檔
  if (/[🔵🟡❓]/.test(status)) return false;
  return status.includes("✅");
}

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const archived = [];   // { from, to, type: "requirement"|"plan"|"spec"|"bug" }

  for (const { doing, completed, type } of ARCHIVE_DIRS) {
    const doingDir = join(projectDir, doing);
    const completedDir = join(projectDir, completed);
    if (!existsSync(doingDir)) continue;
    if (!existsSync(completedDir)) mkdirSync(completedDir, { recursive: true });

    for (const entry of readdirSync(doingDir)) {
      if (entry.startsWith("_") || entry.startsWith(".")) continue;
      const srcPath = join(doingDir, entry);
      const stat = statSync(srcPath);
      if (!stat.isFile() || !entry.endsWith(".md")) continue;

      const content = readFileSync(srcPath, "utf-8");
      if (!isArchivable(content)) continue;

      const destPath = join(completedDir, entry);
      renameSync(srcPath, destPath);
      archived.push({
        from: `${doing}/${entry}`,
        to: `${completed}/${entry}`,
        type,
      });
    }
  }

  // ── 寫入 manifest（供 knowledge hook 讀取） ──────────────────
  const manifestPath = join(projectDir, "docs", ".last-session-archive.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({ archivedAt: new Date().toISOString(), files: archived }, null, 2),
    "utf-8"
  );

  if (archived.length > 0) {
    process.stderr.write(
      `📦 SessionEnd 歸檔完成（${archived.length} 個文件）:\n` +
        archived.map((a) => `  - [${a.type}] ${a.from} → ${a.to}`).join("\n") + "\n"
    );
  }

  process.exit(0);
}

main();
