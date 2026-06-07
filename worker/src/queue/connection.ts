/** Redis 連線設定（BullMQ 用）。 */
import { Redis, type RedisOptions } from 'ioredis';
import { config } from '../config.js';

/**
 * BullMQ 連線選項。BullMQ 會自行依此建立 / 複製連線（blocking worker 需要）。
 * 傳「選項物件」而非共用 Redis 實例，可避免 bullmq 內嵌 ioredis 與本專案
 * ioredis 型別不同源的衝突。
 */
export const redisConnection: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null,
};

let shared: Redis | null = null;

/** 取得共用 Redis 連線（供非 BullMQ 用途，如自訂快取）。 */
export function getRedis(): Redis {
  if (shared) return shared;
  shared = new Redis(redisConnection);
  return shared;
}

/** 關閉連線（優雅關機用）。 */
export async function closeRedis(): Promise<void> {
  if (shared) {
    await shared.quit();
    shared = null;
  }
}
