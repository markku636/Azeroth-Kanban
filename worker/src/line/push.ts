/**
 * LINE 推播 helper + Flex 股票卡 builder。
 * 缺 channel 設定時略過（不崩潰）。
 */
import type { messagingApi } from '@line/bot-sdk';
import type { TradeSignal } from '@azeroth/common';
import { STOCK_DISCLAIMER } from '@azeroth/common';
import { getLineClient } from './client.js';
import { log } from '../logger.js';

type Message = messagingApi.Message;

/** 推播訊息給單一或多位使用者。 */
export async function pushMessages(to: string | string[], messages: Message[]): Promise<void> {
  const client = getLineClient();
  if (!client) {
    log.warn('LINE 未設定，略過推播');
    return;
  }
  const targets = Array.isArray(to) ? to : [to];
  for (const userId of targets) {
    try {
      await client.pushMessage({ to: userId, messages });
    } catch (e) {
      log.error('LINE 推播失敗', { userId, error: (e as Error).message });
    }
  }
}

const ACTION_COLOR: Record<string, string> = { BUY: '#d9001b', SELL: '#1f8a37', HOLD: '#888888' };

/** 訊號卡（Flex bubble）。 */
export function buildSignalCard(signal: TradeSignal, name?: string): Message {
  const color = ACTION_COLOR[signal.action] ?? '#888888';
  return {
    type: 'flex',
    altText: `${signal.symbol} 訊號：${signal.action}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `${signal.symbol}${name ? ` ${name}` : ''}`, weight: 'bold', size: 'xl' },
          { type: 'text', text: signal.date, size: 'xs', color: '#999999' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: signal.action, weight: 'bold', size: 'xxl', color },
          { type: 'text', text: `信心 ${signal.confidence}`, size: 'sm', color: '#555555' },
          ...(signal.entryZone ? [{ type: 'text' as const, text: `進場 ${signal.entryZone}`, size: 'sm' as const, wrap: true }] : []),
          ...(signal.stopLoss != null ? [{ type: 'text' as const, text: `停損 ${signal.stopLoss}　停利 ${signal.takeProfit ?? '-'}`, size: 'sm' as const }] : []),
          { type: 'separator', margin: 'md' },
          { type: 'text', text: signal.rationale, size: 'xs', color: '#666666', wrap: true },
          { type: 'text', text: STOCK_DISCLAIMER, size: 'xxs', color: '#aaaaaa', wrap: true, margin: 'md' },
        ],
      },
    },
  };
}

/** 報告摘要卡。 */
export function buildReportCard(title: string, summary: string, url?: string): Message {
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: summary, size: 'sm', color: '#666666', wrap: true },
          { type: 'text', text: STOCK_DISCLAIMER, size: 'xxs', color: '#aaaaaa', wrap: true, margin: 'md' },
        ],
      },
      ...(url
        ? {
            footer: {
              type: 'box',
              layout: 'vertical',
              contents: [
                { type: 'button', style: 'link', action: { type: 'uri', label: '看完整報告', uri: url } },
              ],
            },
          }
        : {}),
    },
  };
}
