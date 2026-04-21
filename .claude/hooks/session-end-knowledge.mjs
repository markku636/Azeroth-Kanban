/**
 * SessionEnd 知識庫提煉 Hook（Node.js ESM 跨平台版）v2
 *
 * 讀取 session-end-archive.mjs 寫入的 .archive-manifest.json，
 * 取得本次 Session 實際歸檔的 Spec/Bug 清單，
 * 呼叫 Claude CLI 進行 AI 知識提煉，結果寫入 docs/knowledge/{category}/。
 * 同時維護 docs/knowledge/INDEX.md 索引。
 *
 * 執行順序：必須在 session-end-archive.mjs 之後（settings.json 陣列第二位）
 * 前置條件：claude CLI 在 PATH 中可執行
 *
 * ⚠️  claude CLI 呼叫說明：
 *   本腳本使用 `spawnSync('claude', ['--print', prompt])` 傳入 prompt。
 *   若你的 claude CLI 版本不支援 `--print`，請執行 `claude --help` 確認正確旗標。
 */

import {
  readFileSync, readdirSync, writeFileSync,
  existsSync, mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const KNOWLEDGE_CATEGORIES = ["architecture", "patterns", "domain", "integrations"];

// ── 從 archive manifest 收集本次歸檔的 Spec/Bug 內容 ─────────
function collectFromManifest(projectDir) {
  const manifestPath = join(projectDir, "docs", ".archive-manifest.json");
  if (!existsSync(manifestPath)) return [];

  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf-8")); }
  catch { return []; }

  const collected = [];
  for (const { to, type } of (manifest.files ?? [])) {
    if (type !== "spec" && type !== "bug") continue; // 只提煉 spec/bug，不提煉 plan
    const absPath = join(projectDir, to);
    if (!existsSync(absPath)) continue;
    const content = readFileSync(absPath, "utf-8");
    collected.push({ file: to, content });
  }
  return collected;
}

// ── 取下一個流水號 ────────────────────────────────────────────
function nextSerial(dir, today) {
  if (!existsSync(dir)) return "001";
  const nums = readdirSync(dir)
    .filter((f) => f.startsWith(today))
    .map((f) => parseInt(f.slice(9, 12), 10))
    .filter((n) => !isNaN(n));
  return nums.length === 0 ? "001" : String(Math.max(...nums) + 1).padStart(3, "0");
}

// ── 更新 INDEX.md ─────────────────────────────────────────────
function updateIndex(projectDir, entries, today) {
  const indexPath = join(projectDir, "docs", "knowledge", "INDEX.md");
  const header =
    "# Knowledge 索引\n\n" +
    "> 本檔案由 `.claude/hooks/session-end-knowledge.mjs` 於 Session 結束時自動維護。\n" +
    "> 新增/更新 Knowledge 文件後，會在此表格追加對應列。\n\n" +
    "| 日期 | 分類 | 檔案 | 摘要 |\n| --- | --- | --- | --- |\n";
  let existing = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : header;
  if (!existing.includes("| 日期 |")) existing = header;

  const dateStr = `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}`;
  for (const { category, filename, summary } of entries) {
    const row = `| ${dateStr} | ${category} | \`${filename}\` | ${summary} |\n`;
    existing += row;
  }
  writeFileSync(indexPath, existing, "utf-8");
}

// ── 主邏輯 ──────────────────────────────────────────────────────
function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const docs = collectFromManifest(projectDir);

  if (docs.length === 0) {
    process.stderr.write("🧠 SessionEnd Knowledge: manifest 無 Spec/Bug，跳過提煉。\n");
    process.exit(0);
  }

  const docsText = docs.map((d) => `=== ${d.file} ===\n${d.content}`).join("\n\n");

  const prompt = `你是一個知識提煉助手。請分析以下已完成的 Spec 與 Bug 文件，
提煉出對未來開發有複用價值的知識。

分類標準：
- architecture：模組關係、資料流、系統邊界、DB schema 設計決策
- patterns：coding pattern、慣例、最佳實踐、migration 規範
- domain：商業規則、領域邏輯、業務流程
- integrations：API 串接踩坑、第三方服務注意事項

若某文件無可提煉知識，不要強制產生。

請嚴格輸出以下 JSON 格式（不要加任何 markdown 或說明文字）：
{"entries":[{"category":"architecture|patterns|domain|integrations","topic":"kebab-case","summary":"一句話摘要（用於 INDEX.md）","content":"完整 Markdown 內容（參考 _knowledge-template.md 格式）"}]}
若無可提煉知識，輸出：{"entries":[]}

${docsText}`;

  // 呼叫 claude CLI
  const result = spawnSync("claude", ["--print", prompt], {
    encoding: "utf-8",
    timeout: 100_000,
    cwd: projectDir,
  });

  if (result.error || result.status !== 0) {
    process.stderr.write(
      `⚠️  SessionEnd Knowledge: claude CLI 呼叫失敗 — ${result.error?.message ?? result.stderr ?? "(未知錯誤)"}\n`
    );
    process.exit(0);
  }

  let parsed;
  try {
    const json = result.stdout.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    parsed = JSON.parse(json);
  } catch {
    process.stderr.write("⚠️  SessionEnd Knowledge: 無法解析 AI 輸出，跳過。\n");
    process.exit(0);
  }

  if (!parsed.entries?.length) {
    process.stderr.write("🧠 SessionEnd Knowledge: AI 判斷無可提煉知識，跳過。\n");
    process.exit(0);
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const written = [];
  const indexEntries = [];

  for (const { category, topic, summary, content } of parsed.entries) {
    if (!KNOWLEDGE_CATEGORIES.includes(category)) continue;
    const categoryDir = join(projectDir, "docs", "knowledge", category);
    if (!existsSync(categoryDir)) mkdirSync(categoryDir, { recursive: true });

    const existing = readdirSync(categoryDir).find(
      (f) => f.endsWith(".md") && !f.startsWith("_") && f.includes(topic)
    );

    let filename;
    if (existing) {
      const existingPath = join(categoryDir, existing);
      const prev = readFileSync(existingPath, "utf-8");
      writeFileSync(
        existingPath,
        `${prev}\n\n---\n\n<!-- 更新 ${today}，來源：${docs.map((d) => d.file).join(", ")} -->\n\n${content}`,
        "utf-8"
      );
      filename = existing;
      written.push(`更新: ${category}/${existing}`);
    } else {
      const serial = nextSerial(categoryDir, today);
      filename = `${today}-${serial}-${topic}.md`;
      writeFileSync(join(categoryDir, filename), content, "utf-8");
      written.push(`新建: ${category}/${filename}`);
    }
    indexEntries.push({ category, filename, summary: summary ?? topic });
  }

  updateIndex(projectDir, indexEntries, today);

  process.stderr.write(
    `🧠 SessionEnd Knowledge: 完成（${written.length} 項）:\n` +
      written.map((w) => `  - ${w}`).join("\n") + "\n"
  );
  process.exit(0);
}

main();
