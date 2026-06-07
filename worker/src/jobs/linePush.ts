/** line-push 佇列 consumer：把已組好的 LINE 訊息推給收件者。 */
import type { Job } from 'bullmq';
import type { messagingApi } from '@line/bot-sdk';
import type { LinePushJobData } from '../queue/queues.js';
import { pushMessages } from '../line/push.js';
import { log } from '../logger.js';

export async function processLinePush(job: Job<LinePushJobData>) {
  const { to, messages } = job.data;
  await pushMessages(to, messages as messagingApi.Message[]);
  log.info('line push done', { to: Array.isArray(to) ? to.length : 1 });
  return { pushed: true };
}
