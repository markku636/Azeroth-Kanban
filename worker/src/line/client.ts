/** LINE Messaging API client（worker 推播用）。缺設定回 null。 */
import { messagingApi } from '@line/bot-sdk';
import { config } from '../config.js';

let cached: messagingApi.MessagingApiClient | null | undefined;

export function getLineClient(): messagingApi.MessagingApiClient | null {
  if (cached !== undefined) return cached;
  if (!config.line.channelAccessToken) {
    cached = null;
    return cached;
  }
  cached = new messagingApi.MessagingApiClient({ channelAccessToken: config.line.channelAccessToken });
  return cached;
}

export function isLineAvailable(): boolean {
  return getLineClient() !== null;
}
