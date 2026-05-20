/**
 * 混沌(故障)狀態與各故障模式的實作。
 *
 * 故障模式持久化到檔案 —— crash 模式在容器重啟後仍生效,形成真實的 crashloop。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { log } from "./logger";

export type ChaosMode = "none" | "memory-leak" | "error-5xx" | "slow" | "cpu-spin" | "crash";

const VALID_MODES: ChaosMode[] = ["none", "memory-leak", "error-5xx", "slow", "cpu-spin", "crash"];
const STATE_FILE = process.env.CHAOS_STATE_FILE ?? "/tmp/selkie-chaos";

/** 把任意值正規化為合法的 ChaosMode。 */
export function normalizeMode(value: unknown): ChaosMode {
  return typeof value === "string" && (VALID_MODES as string[]).includes(value)
    ? (value as ChaosMode)
    : "none";
}

/** 載入故障模式:優先讀持久化檔案,其次讀 CHAOS_MODE env。 */
function loadMode(): ChaosMode {
  try {
    if (existsSync(STATE_FILE)) {
      return normalizeMode(readFileSync(STATE_FILE, "utf8").trim());
    }
  } catch {
    /* 讀檔失敗則退回 env */
  }
  return normalizeMode(process.env.CHAOS_MODE);
}

/** 記憶體洩漏用:持續累積、永不釋放的字串。 */
const leakStore: string[] = [];
const LEAK_CHUNK_BYTES = 4096;

/**
 * 取得目前故障模式 —— 每次都讀持久化檔案。
 *
 * 重要:Next.js standalone 會把 instrumentation 與各 API route 各自打包,
 * chaos.ts 在不同 bundle 各有一份模組實例、記憶體變數「並不共用」。
 * 因此一律以「檔案」為單一真實來源:setMode 寫檔、getMode 讀檔,
 * 確保背景作業 tick 與 /api/chaos 設定的模式一致(也讓 crash 跨容器重啟生效)。
 */
export function getMode(): ChaosMode {
  return loadMode();
}

export function setMode(mode: ChaosMode): void {
  try {
    writeFileSync(STATE_FILE, mode);
  } catch {
    /* 寫檔失敗:此實例無法持久化故障模式,變更可能不生效 */
  }
  log("WARN", `chaos mode set to "${mode}"`, { route: "/api/chaos", chaos: mode });
}

/** 配置一批永不釋放的記憶體(模擬記憶體洩漏)。 */
export function leakMemory(chunks = 800): void {
  for (let i = 0; i < chunks; i++) {
    leakStore.push("x".repeat(LEAK_CHUNK_BYTES));
  }
}

/** 目前已洩漏的位元組數。 */
export function leakedBytes(): number {
  return leakStore.length * LEAK_CHUNK_BYTES;
}

/** 忙迴圈佔用 CPU 指定毫秒數。 */
export function burnCpu(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    Math.sqrt(Math.random() * 1_000_000);
  }
}

/** 目前的 RSS(MB)。 */
export function rssMb(): number {
  return Math.round(process.memoryUsage().rss / 1_048_576);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
