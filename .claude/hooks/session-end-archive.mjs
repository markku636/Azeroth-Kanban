/**
 * SessionEnd 自動歸檔 Hook（Node.js ESM 跨平台版）v2
 *
 * Session 結束時，掃描 doing/ 資料夾，將標記為 ✅ 的文件
 * 自動移至對應的 completed/ 資料夾。
 * 歸檔完成後，寫入 docs/.archive-manifest.json，
 * 供 session-end-knowledge.mjs 讀取（取代不可靠的日期篩選）。
 *
 * 歸檔對象：
 *   - docs/plans/doing/    → docs/plans/completed/
 *   - docs/specs/doing/    → docs/specs/completed/
 *   - docs/bugs/doing/     → docs/bugs/completed/
 *
 * 使用方式：由 Claude Code SessionEnd Hook 自動呼叫（第一個執行）
 */

import { readFileSync, readdirSync, renameSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ARCHIVE_DIRS = [
  { doing: "docs/plans/doing",  completed: "docs/plans/completed" },
  { doing: "docs/specs/doing",  completed: "docs/specs/completed" },
  { doing: "docs/bugs/doing",   completed: "docs/bugs/completed" },
];

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const archived = [];   // { from, to, type: "spec"|"bug"|"plan" }

  for (const { doing, completed } of ARCHIVE_DIRS) {
    const doingDir = join(projectDir, doing);
    const completedDir = join(projectDir, completed);
    if (!existsSync(doingDir)) continue;
    if (!existsSync(completedDir)) mkdirSync(completedDir, { recursive: true });

    for (const entry of readdirSync(doingDir)) {
      if (entry.startsWith("_") || entry.startsWith(".")) continue;
      const srcPath = join(doingDir, entry);
      const stat = statSync(srcPath);
      let content = "";

      if (stat.isFile() && entry.endsWith(".md")) {
        content = readFileSync(srcPath, "utf-8");
      } else if (stat.isDirectory()) {
        const planFile = join(srcPath, "plan.md");
        if (existsSync(planFile)) content = readFileSync(planFile, "utf-8");
        else continue;
      } else {
        continue;
      }

      if (content.includes("✅")) {
        const destPath = join(completedDir, entry);
        renameSync(srcPath, destPath);
        archived.push({
          from: `${doing}/${entry}`,
          to: `${completed}/${entry}`,
          type: doing.includes("spec") ? "spec" : doing.includes("bug") ? "bug" : "plan",
        });
      }
    }
  }

  // ── 寫入 manifest（供 knowledge hook 讀取） ──────────────────
  const manifestPath = join(projectDir, "docs", ".archive-manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({ archivedAt: new Date().toISOString(), files: archived }, null, 2),
    "utf-8"
  );

  if (archived.length > 0) {
    process.stderr.write(
      `📦 SessionEnd 歸檔完成（${archived.length} 個文件）:\n` +
        archived.map((a) => `  - ${a.from} → ${a.to}`).join("\n") + "\n"
    );
  }

  process.exit(0);
}

main();
