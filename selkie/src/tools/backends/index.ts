/**
 * 後端選擇器 —— 依環境變數 TOOL_BACKEND 回傳 mock 或 real 後端。
 */
import { config } from "../../config.js";
import { mockBackend } from "./mock.js";
import { realBackend } from "./real.js";
import type { OncallBackend } from "./types.js";

let cached: OncallBackend | null = null;

/** 取得目前設定的工具後端(具快取)。 */
export function getBackend(): OncallBackend {
  if (cached) return cached;

  // real:查真實的 Elasticsearch(sim-service 經 filebeat 送入);
  // mock:內建假資料(輕量 / 離線用)。
  cached = config.toolBackend === "real" ? realBackend : mockBackend;
  return cached;
}

export type { OncallBackend } from "./types.js";
