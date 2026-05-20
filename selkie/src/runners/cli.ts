/**
 * CLI 入口 —— 從終端機對單一事故跑 triage。
 *
 * 用法:
 *   npm run cli -- <incidentId | 案例檔路徑>
 * 範例:
 *   npm run cli -- INC-1024
 *   npm run cli -- evals/cases/oom-incident.json
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { assertVertexConfig } from "../config.js";
import { runTriage } from "../triage.js";

/** 參數可以是 incident ID,或是含 incidentId 欄位的案例 JSON 檔路徑。 */
async function resolveIncidentId(arg: string): Promise<string> {
  if (arg.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(await readFile(arg, "utf8")) as { incidentId?: string };
    if (!parsed.incidentId) {
      throw new Error(`案例檔 ${arg} 缺少 incidentId 欄位。`);
    }
    return parsed.incidentId;
  }
  return arg;
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error("用法: npm run cli -- <incidentId | 案例檔路徑>");
    console.error("範例: npm run cli -- INC-1024");
    console.error("      npm run cli -- evals/cases/oom-incident.json");
    process.exit(1);
  }

  assertVertexConfig();
  const incidentId = await resolveIncidentId(arg);

  console.log(`🔍 開始 triage 事故 ${incidentId}`);
  console.log("   (deep agent 正在規劃並委派 subagent 調查,可能需要 1–3 分鐘)\n");

  const { finalText, report, elapsedSeconds } = await runTriage(incidentId);

  console.log("════════════════════ Triage 摘要 ════════════════════\n");
  console.log(finalText.trim() || "(agent 未產生摘要訊息)");

  if (report) {
    console.log("\n═════════════════ incident-report.md ═════════════════\n");
    console.log(report.trim());
  } else {
    console.log("\n⚠️  agent 未寫入 incident-report.md(僅有上方摘要)。");
  }

  console.log(`\n⏱️  完成,耗時 ${elapsedSeconds.toFixed(1)}s`);
}

main().catch((err: unknown) => {
  console.error("\n❌ Triage 失敗:");
  console.error(err);
  process.exit(1);
});
