/**
 * Worker 心跳：每 30s 寫一個帶 TTL 的 Redis key，
 * admin 監控頁據此判斷 worker 是否在線。
 */
import { getRedis } from './queue/connection.js';
import { log } from './logger.js';

export const HEARTBEAT_KEY = 'stock:worker:heartbeat';
const INTERVAL_MS = 30_000;
const TTL_SEC = 90;

/** 啟動心跳，回傳停止函式。 */
export function startHeartbeat(): () => void {
  const redis = getRedis();
  const beat = async () => {
    try {
      await redis.set(HEARTBEAT_KEY, String(Date.now()), 'EX', TTL_SEC);
    } catch (e) {
      log.warn('heartbeat 寫入失敗', { error: (e as Error).message });
    }
  };
  void beat();
  const timer = setInterval(() => void beat(), INTERVAL_MS);
  log.info('heartbeat started', { intervalMs: INTERVAL_MS, ttlSec: TTL_SEC });
  return () => clearInterval(timer);
}
