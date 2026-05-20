/**
 * Smoke 測試 —— 驗證 Vertex AI 認證與 Gemini 模型可用。
 *
 * 執行: npm run smoke
 */
import "dotenv/config";
import { assertVertexConfig, config } from "../config.js";
import { makeModel } from "../model.js";

async function main(): Promise<void> {
  assertVertexConfig();
  console.log(
    `🔧 專案=${config.gcp.project} 地區=${config.gcp.location} 模型=${config.model.main}`,
  );
  const model = makeModel();
  const res = await model.invoke(
    "You are a smoke test. Reply with exactly: oncall-agent vertex smoke OK",
  );
  console.log("✅ Gemini 回應:", res.content);
  console.log("✅ Vertex AI 認證與模型呼叫正常。");
}

main().catch((err: unknown) => {
  console.error("❌ Smoke 測試失敗:");
  console.error(err);
  process.exit(1);
});
