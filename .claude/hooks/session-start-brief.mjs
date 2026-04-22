/**
 * SessionStart 上下文摘要 Hook（Node.js ESM 跨平台版）v2
 *
 * Session 開啟時，掃描 docs/requirements/doing/、docs/plans/doing/、docs/specs/doing/、docs/bugs/doing/，
 * 以 additionalContext 注入進行中的 PRD/Plan/Spec/Bug 摘要給 Claude，
 * 讓對話一開始就知道專案有哪些未完成的工作流文件。
 *
 * 使用方式：由 Claude Code SessionStart Hook 自動呼叫
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const SCAN_DIRS = [
  { label: "PRD",  dir: "docs/requirements/doing" },
  { label: "Plan", dir: "docs/plans/doing" },
  { label: "Spec", dir: "docs/specs/doing" },
  { label: "Bug",  dir: "docs/bugs/doing"  },
];

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "（無標題）";
}

// 只讀取「狀態列」判斷狀態，避免被內文敘述性 emoji 誤觸發。
// 匹配 `> 狀態: ...` 或 `> **狀態**: ...`。
function extractStatus(content) {
  const match = content.match(/^\s*>\s*(?:\*\*)?\s*狀態\s*(?:\*\*)?\s*:\s*(.+)$/m);
  if (!match) return "❓ 狀態未標記";
  const status = match[1].replace(/\*/g, "").trim();
  // 優先順位：進行中 > 討論中 > 完成（模板佔位符同時含三者時取正在進行的狀態）
  if (status.includes("🔵")) return "🔵 進行中";
  if (status.includes("🟡")) return "🟡 討論中";
  if (status.includes("✅")) return "✅ 已完成 / 已確認";
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
      if (!stat.isFile() || !entry.endsWith(".md")) continue;

      const content = readFileSync(entryPath, "utf-8");
      const title = extractTitle(content);
      const status = extractStatus(content);
      lines.push(`  - [${label}] ${status} \`${dir}/${entry}\` — ${title}`);
    }
  }

  if (lines.length === 0) {
    const response = {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: "📋 Write-doc-before-Code: 目前無進行中的 PRD/Plan/Spec/Bug。",
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
