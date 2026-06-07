/** LINE reply helper（admin webhook 用）。缺設定時略過。 */
import { messagingApi } from '@line/bot-sdk';

let client: messagingApi.MessagingApiClient | null | undefined;

function getClient(): messagingApi.MessagingApiClient | null {
  if (client !== undefined) {
    return client;
  }
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  client = token ? new messagingApi.MessagingApiClient({ channelAccessToken: token }) : null;
  return client;
}

export async function replyText(replyToken: string, text: string): Promise<void> {
  const c = getClient();
  if (!c) {
    return;
  }
  await c.replyMessage({ replyToken, messages: [{ type: 'text', text }] });
}
