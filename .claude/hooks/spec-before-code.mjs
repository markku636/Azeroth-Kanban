/**
 * Spec-before-Code 攔截 Hook（Node.js ESM 跨平台版）v2
 *
 * 在 Edit/Write 程式碼檔案前：
 * 1. 確認有 🔵 狀態的 Spec
 * 2. 確認該 Spec 的「受影響檔案」區塊包含此次修改的檔案路徑
 *    （精準比對，避免「有任意 Spec 就放行」的假安全感）
 *
 * 使用方式：由 Claude Code PreToolUse Hook 自動呼叫
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
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

// 從 Spec 內容提取所有路徑片段（粗比對：取反引號包住的路徑字串）
function extractPaths(content) {
  const matches = content.match(/`([^`]+\.[a-zA-Z]+)`/g) ?? [];
  return matches.map((m) => m.replace(/`/g, "").replace(/\\/g, "/"));
}

function main() {
  const input = readStdin();
  if (!input) process.exit(0);

  const filePath = (input.tool_input?.file_path ?? input.tool_input?.filePath ?? "")
    .replace(/\\/g, "/");
  if (!filePath) process.exit(0);

  const ext = extname(filePath).toLowerCase();
  if (!CODE_EXTENSIONS.has(ext)) process.exit(0);

  const projectDir = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, "/");
  // 取相對路徑，方便與 Spec 內容比對
  const relPath = filePath.startsWith(projectDir)
    ? filePath.slice(projectDir.length).replace(/^\//, "")
    : filePath;

  const specsDir = join(projectDir, "docs", "specs", "doing");

  if (!existsSync(specsDir)) {
    process.stderr.write(
      "⛔ Spec-before-Code: docs/specs/doing/ 目錄不存在。\n請先建立 Spec 再修改程式碼。\n"
    );
    process.exit(2);
  }

  const specFiles = readdirSync(specsDir).filter((f) => f.endsWith(".spec.md"));
  const activeSpecs = specFiles.filter((f) => {
    const content = readFileSync(join(specsDir, f), "utf-8");
    return content.includes("🔵");
  });

  if (activeSpecs.length === 0) {
    process.stderr.write(
      "⛔ Spec-before-Code: 找不到狀態為 🔵（開發中）的 Spec。\n" +
      "請先建立 Spec（/create-spec）並確認後再修改程式碼。\n" +
      `修改目標: ${relPath}\n`
    );
    process.exit(2);
  }

  // 精準比對：確認修改的檔案出現在某個 Spec 的受影響檔案列表中
  const matchedSpec = activeSpecs.find((f) => {
    const content = readFileSync(join(specsDir, f), "utf-8");
    const paths = extractPaths(content);
    // 任一路徑片段出現在 relPath 中（或反向），視為相關
    return paths.some((p) => relPath.includes(p) || p.includes(relPath));
  });

  if (!matchedSpec) {
    process.stderr.write(
      "⛔ Spec-before-Code: 現有 Spec 的受影響檔案列表未包含此檔案。\n" +
      `修改目標: ${relPath}\n` +
      "請更新 Spec 的「受影響檔案」區塊，或建立新的 Spec。\n"
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
