/**
 * Gemini on Vertex AI 模型工廠。
 *
 * 認證走 Google ADC:GOOGLE_APPLICATION_CREDENTIALS 指向 service account JSON,
 * 或本機 `gcloud auth application-default login`;專案 ID 由 GOOGLE_CLOUD_PROJECT 提供。
 *
 * deep agent(主 agent + 4 個 subagent)會並發呼叫 Gemini,低配額專案易觸發 HTTP 429。
 * 對策:每個模型 maxConcurrency=1(序列化各自的呼叫)+ maxRetries 退避重試;並在主
 * agent 提示中要求「一次只委派一個 subagent」,把整體執行壓成近似序列。
 */
import { ChatVertexAI } from "@langchain/google-vertexai";
import { config } from "./config.js";

export interface ModelOptions {
  /** 覆寫模型名稱,預設為 config.model.main */
  model?: string;
  /** 取樣溫度,oncall 調查需要穩定輸出,預設 0 */
  temperature?: number;
  /** 最大輸出 token 數 */
  maxOutputTokens?: number;
}

/** 建立主 agent(orchestrator)用的 Gemini 模型。 */
export function makeModel(opts: ModelOptions = {}): ChatVertexAI {
  return new ChatVertexAI({
    model: opts.model ?? config.model.main,
    location: config.gcp.location,
    temperature: opts.temperature ?? 0,
    maxOutputTokens: opts.maxOutputTokens ?? 8192,
    maxConcurrency: config.model.maxConcurrency,
    maxRetries: 6,
  });
}

/** 建立 subagent 用的較快 / 較便宜模型(Gemini Flash)。 */
export function makeFastModel(opts: ModelOptions = {}): ChatVertexAI {
  return makeModel({ model: config.model.fast, ...opts });
}
