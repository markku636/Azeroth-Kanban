/**
 * Eval 評測 —— 對 evals/cases/ 下的每個範例事故跑一次 triage,
 * 並依案例的 expected 區塊評分(嚴重度、根因關鍵字、肇因部署、是否建議回滾)。
 *
 * 需要 Vertex / Gemini 憑證。執行: npm run eval
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertVertexConfig } from "../src/config.js";
import { runTriage } from "../src/triage.js";

interface EvalCase {
  incidentId: string;
  name: string;
  expected: {
    severity: string[];
    rootCauseKeywords: string[];
    culpritService?: string;
    culpritDeploy?: string;
    shouldRecommendRollback?: boolean;
  };
}

interface Check {
  name: string;
  pass: boolean;
}

const CASES_DIR = join(process.cwd(), "evals", "cases");

/** 依 expected 對 agent 輸出評分。 */
function scoreCase(testCase: EvalCase, output: string): Check[] {
  const lower = output.toLowerCase();
  const exp = testCase.expected;
  const checks: Check[] = [];

  checks.push({
    name: `嚴重度落在 ${exp.severity.join(" / ")}`,
    pass: exp.severity.some((s) => output.includes(s)),
  });

  const hitKeywords = exp.rootCauseKeywords.filter((k) => lower.includes(k.toLowerCase()));
  checks.push({
    name: `根因關鍵字命中 ${hitKeywords.length}/${exp.rootCauseKeywords.length}`,
    pass: hitKeywords.length >= Math.ceil(exp.rootCauseKeywords.length / 2),
  });

  if (exp.culpritService) {
    checks.push({
      name: `指出肇因服務 ${exp.culpritService}`,
      pass: lower.includes(exp.culpritService.toLowerCase()),
    });
  }
  if (exp.culpritDeploy) {
    checks.push({
      name: `指出肇因部署 ${exp.culpritDeploy}`,
      pass: output.includes(exp.culpritDeploy),
    });
  }
  if (exp.shouldRecommendRollback) {
    checks.push({ name: "建議回滾止血", pass: /rollback|回滾/i.test(output) });
  }
  return checks;
}

async function main(): Promise<void> {
  assertVertexConfig();
  const files = (await readdir(CASES_DIR)).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("evals/cases/ 下沒有案例檔。");
    return;
  }

  let totalPassed = 0;
  let totalChecks = 0;

  for (const file of files) {
    const testCase = JSON.parse(
      await readFile(join(CASES_DIR, file), "utf8"),
    ) as EvalCase;

    console.log(`\n▶ ${testCase.name}(${testCase.incidentId})— 調查中...`);
    const start = Date.now();
    const { finalText, report } = await runTriage(testCase.incidentId, {
      threadId: `eval-${testCase.incidentId}-${Date.now()}`,
    });
    const output = `${finalText}\n${report ?? ""}`;
    const checks = scoreCase(testCase, output);
    const passed = checks.filter((c) => c.pass).length;

    for (const check of checks) {
      console.log(`   ${check.pass ? "✅" : "❌"} ${check.name}`);
    }
    console.log(
      `   → ${passed}/${checks.length} 通過(耗時 ${((Date.now() - start) / 1000).toFixed(0)}s)`,
    );

    totalPassed += passed;
    totalChecks += checks.length;
  }

  console.log(`\n══════ 評測總分: ${totalPassed}/${totalChecks} ══════`);
  if (totalPassed < totalChecks) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error("❌ 評測失敗:");
  console.error(err);
  process.exit(1);
});
