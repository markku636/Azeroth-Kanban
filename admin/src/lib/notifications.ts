/**
 * 通知通道 fan-out —— 監控引擎在事故 down / recovery / re-alert 時依設定發出通知。
 *
 * 支援通道種類:
 *   - CONSOLE        把通知 console.log 到 admin 容器(demo / dev)
 *   - SLACK_WEBHOOK  config.webhookUrl → POST Slack message
 *   - GENERIC_WEBHOOK config.url(+ config.headers) → POST JSON payload
 *
 * 全部 5s 逾時、`Promise.allSettled` 平行 fan-out,單通道失敗不影響其他通道與整個 tick。
 */
import type { Monitor, MonitorChannel, NotificationChannel } from '@prisma/client';

export interface NotifyResult {
  result: 'OK' | 'FAIL' | 'SKIPPED';
  magnitude?: number | null;
  latencyMs?: number | null;
  detail?: string | null;
}

export type NotifyEvent = 'down' | 'recovery' | 're-alert';

type ChannelLink = MonitorChannel & { channel: NotificationChannel };

const NOTIFY_TIMEOUT_MS = 5_000;

export async function notifyChannels(
  links: ChannelLink[],
  event: NotifyEvent,
  monitor: Monitor,
  result: NotifyResult,
): Promise<void> {
  const eligible = links.filter((l) => {
    if (!l.channel.enabled) return false;
    if (event === 'down' && !l.notifyOnDown) return false;
    if (event === 'recovery' && !l.notifyOnRecovery) return false;
    if (event === 're-alert' && !l.notifyOnReAlert) return false;
    return true;
  });
  if (eligible.length === 0) return;

  await Promise.allSettled(eligible.map((l) => sendOne(event, monitor, result, l.channel)));
}

async function sendOne(
  event: NotifyEvent,
  monitor: Monitor,
  result: NotifyResult,
  channel: NotificationChannel,
): Promise<void> {
  try {
    if (channel.kind === 'CONSOLE') {
      console.log(
        `[notify:${event}] monitor="${monitor.name}" kind=${monitor.kind} service=${monitor.service ?? '-'} ` +
          `result=${result.result} magnitude=${result.magnitude ?? '-'} detail="${result.detail ?? ''}"`,
      );
      return;
    }
    const cfg = (channel.config ?? {}) as Record<string, unknown>;
    if (channel.kind === 'SLACK_WEBHOOK') {
      const webhookUrl = typeof cfg.webhookUrl === 'string' ? cfg.webhookUrl : '';
      if (!webhookUrl) throw new Error('SLACK_WEBHOOK channel missing config.webhookUrl');
      await timedFetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSlackMessage(event, monitor, result)),
      });
      return;
    }
    if (channel.kind === 'GENERIC_WEBHOOK') {
      const url = typeof cfg.url === 'string' ? cfg.url : '';
      if (!url) throw new Error('GENERIC_WEBHOOK channel missing config.url');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (cfg.headers && typeof cfg.headers === 'object') {
        for (const [k, v] of Object.entries(cfg.headers as Record<string, unknown>)) {
          if (typeof v === 'string') headers[k] = v;
        }
      }
      await timedFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          event,
          monitor: {
            id: monitor.id,
            name: monitor.name,
            kind: monitor.kind,
            service: monitor.service,
            state: monitor.state,
          },
          result,
          timestamp: new Date().toISOString(),
        }),
      });
      return;
    }
  } catch (e) {
    console.error(
      `[notify] channel "${channel.name}" (${channel.kind}) failed:`,
      e instanceof Error ? e.message : e,
    );
  }
}

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), NOTIFY_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildSlackMessage(event: NotifyEvent, monitor: Monitor, result: NotifyResult): unknown {
  const color = event === 'down' ? '#e53935' : event === 're-alert' ? '#fb8c00' : '#43a047';
  const emoji = event === 'down' ? '🚨' : event === 're-alert' ? '🔔' : '✅';
  return {
    text: `${emoji} *${monitor.name}* — ${event.toUpperCase()}`,
    attachments: [
      {
        color,
        fields: [
          { title: 'Service', value: monitor.service ?? '-', short: true },
          { title: 'Kind', value: monitor.kind, short: true },
          { title: 'Magnitude', value: String(result.magnitude ?? '-'), short: true },
          { title: 'Latency', value: result.latencyMs != null ? `${result.latencyMs}ms` : '-', short: true },
          { title: 'Detail', value: result.detail ?? '-', short: false },
        ],
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}
