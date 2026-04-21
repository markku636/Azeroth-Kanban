/**
 * SessionStart 上下文摘要 Hook（Node.js ESM 跨平台版）
 *
 * Session 開啟時，掃描 docs/plans/doing/ 與 docs/specs/doing/，
 * 以 additionalContext 注入進行中的 Plan/Spec 摘要給 Claude，
 * 讓對話一開始就知道專案有哪些未完成的工作流文件。
 *
 * 使用方式：由 Claude Code SessionStart Hook 自動呼叫
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const SCAN_DIRS = [
  { label: "Plan", dir: "docs/plans/doing" },
  { label: "Spec", dir: "docs/specs/doing" },
  { label: "Bug",  dir: "docs/bugs/doing"  },
];

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "（無標題）";
}

function extractStatus(content) {
  if (content.includes("✅")) return "✅ 已完成";
  if (content.includes("🔵")) return "🔵 進行中";
  return "❓ 狀態未標記";
}

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const lines = [];

  for (const { label, dir } of SCAN_DIRS) {
    const absDir = join(projectDir, dir);
    if (!existsSync(absDir)) continue;

    const entries = readdirSync(absDir).filter((f) => !f.startsWith("_") && !f.startsWith("."));

    for (const entry of entries) {
      const entryPath = join(absDir, entry);
      const stat = statSync(entryPath);
      let contentPath;

      if (stat.isFile() && (entry.endsWith(".md") || entry.endsWith(".spec.md"))) {
        contentPath = entryPath;
      } else if (stat.isDirectory()) {
        // 資料夾格式 Plan：讀 plan.md
        const planFile = join(entryPath, "plan.md");
        if (existsSync(planFile)) contentPath = planFile;
        else continue;
      } else {
        continue;
      }

      const content = readFileSync(contentPath, "utf-8");
      const title = extractTitle(content);
      const status = extractStatus(content);
      lines.push(`  - [${label}] ${status} \`${dir}/${entry}\` — ${title}`);
    }
  }

  if (lines.length === 0) {
    const response = {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: "📋 Write-doc-before-Code: 目前無進行中的 Plan/Spec/Bug。",
      },
    };
    process.stdout.write(JSON.stringify(response));
    process.exit(0);
  }

  const summary =
    "📋 Write-doc-before-Code — 進行中文件摘要：\n" +
    lines.join("\n") +
    "\n\n開始修改程式碼前，請確認是否有對應的 🔵 Spec，否則 PreToolUse Hook 會攔截。";

  const response = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: summary,
    },
  };
  process.stdout.write(JSON.stringify(response));
  process.exit(0);
}

main();
