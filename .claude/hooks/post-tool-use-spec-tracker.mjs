/**
 * PostToolUse Spec 追蹤 Hook（Node.js ESM 跨平台版）
 *
 * Edit/Write 成功後，將修改的檔案路徑追加至當前 🔵 Spec 的「實際變更」區塊，
 * 形成可追溯的變更記錄。
 *
 * 使用方式：由 Claude Code PostToolUse Hook 自動呼叫
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { extname, join } from "node:path";

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".cs", ".go", ".java", ".rb", ".rs",
  ".cpp", ".c", ".h", ".swift", ".kt",
  ".vue", ".svelte", ".php",
  ".prisma", ".sql",
]);

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf-8")); }
  catch { return null; }
}

function extractPaths(content) {
  const matches = content.match(/`([^`]+\.[a-zA-Z]+)`/g) ?? [];
  return matches.map((m) => m.replace(/`/g, "").replace(/\\/g, "/"));
}

function main() {
  const input = readStdin();
  if (!input) process.exit(0);

  const filePath = (input.tool_input?.file_path ?? input.tool_input?.filePath ?? "")
    .replace(/\\/g, "/");
  const toolName = input.tool_name ?? "";
  if (!filePath) process.exit(0);
  if (!["Edit", "Write"].includes(toolName)) process.exit(0);

  const ext = extname(filePath).toLowerCase();
  if (!CODE_EXTENSIONS.has(ext)) process.exit(0);

  const projectDir = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, "/");
  const relPath = filePath.startsWith(projectDir)
    ? filePath.slice(projectDir.length).replace(/^\//, "")
    : filePath;

  const specsDir = join(projectDir, "docs", "specs", "doing");
  if (!existsSync(specsDir)) process.exit(0);

  const specFiles = readdirSync(specsDir).filter((f) => f.endsWith(".spec.md"));
  const activeSpec = specFiles
    .map((f) => ({ file: f, path: join(specsDir, f), content: readFileSync(join(specsDir, f), "utf-8") }))
    .filter((s) => s.content.includes("🔵"))
    .find((s) => {
      const paths = extractPaths(s.content);
      return paths.some((p) => relPath.includes(p) || p.includes(relPath));
    });

  if (!activeSpec) process.exit(0);

  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const entry = `- \`${relPath}\` — ${toolName} @ ${timestamp}\n`;

  // 若 Spec 尚無「實際變更」區塊，先 append 一個
  if (!activeSpec.content.includes("## 實際變更")) {
    const trackingBlock = `\n## 實際變更\n\n<!-- PostToolUse Hook 自動追加 -->\n\n${entry}`;
    appendFileSync(activeSpec.path, trackingBlock, "utf-8");
  } else {
    // 已有區塊 → 去重後 append
    if (!activeSpec.content.includes(`\`${relPath}\` — ${toolName}`)) {
      appendFileSync(activeSpec.path, entry, "utf-8");
    }
  }

  process.exit(0);
}

main();
