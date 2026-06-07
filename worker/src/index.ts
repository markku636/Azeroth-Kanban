/**
 * Worker 進程入口。
 *
 * 本階段（地基）：初始化設定、Redis、Prisma，掛上優雅關機。
 * 後續增量會在此註冊 BullMQ Workers（analysis/research/digest/line-push）與 scheduler。
 */
import type { Worker } from 'bullmq';
import { config } from './config.js';
import { log } from './logger.js';
import { prisma } from './db.js';
import { closeRedis } from './queue/connection.js';
import './queue/queues.js'; // 確保佇列初始化
import { startWorkers } from './jobs/workers.js';
import { startScheduler } from './jobs/scheduler.js';
import { startHeartbeat } from './heartbeat.js';

let activeWorkers: Worker[] = [];
let stopHeartbeat: (() => void) | undefined;

async function main() {
  log.info('stock worker starting', {
    redis: `${config.redis.host}:${config.redis.port}`,
    finmindToken: config.finmind.token ? 'set' : 'missing',
    claude: config.claude.apiKey || config.claude.oauthToken ? 'env-token' : 'cli-session',
    line: config.line.channelAccessToken ? 'set' : 'missing',
  });

  // 驗證 DB 連線
  await prisma.$queryRaw`SELECT 1`;
  log.info('database connected');

  // 註冊 BullMQ workers + scheduler
  activeWorkers = startWorkers();
  const dispatcher = await startScheduler();
  activeWorkers.push(dispatcher);

  // 心跳（供後台監控 worker 在線狀態）
  stopHeartbeat = startHeartbeat();

  log.info('stock worker ready');
}

async function shutdown(signal: string) {
  log.warn('shutting down', { signal });
  try {
    stopHeartbeat?.();
    await Promise.all(activeWorkers.map((w) => w.close()));
    await closeRedis();
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((e) => {
  log.error('worker failed to start', { error: (e as Error).message });
  process.exit(1);
});
